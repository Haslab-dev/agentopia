import { randomUUID } from 'node:crypto'
import type { WorkEventType } from '@living-world/shared-types'
import type { RunRow, TaskRow } from './db'
import type { AsyncRepository } from './db/async-repository'
import { CompatibleLLM, type ToolCallRequest, type TurnMessage } from './llm/compatible'
import { TOOLS, toolDefsFor, type ArtifactStore } from './tools'
import { estimateCostUsd } from './pricing'
import { broadcastControl, emit } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// Task engine (ARCHITECTURE.md §1.1). One serial worker drains the
// persistent queue: queued → running → completed/failed, with
// waiting_approval as a real, persisted pause state. Every status change
// is (a) written to SQLite first and (b) emitted on the frozen §1.3 event
// contract. A failed run is never rewritten as success; retry creates a
// NEW run row (run_number + 1) and leaves the failed one in history.
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => new Date().toISOString()
const MAX_TURNS = 6

const TOOL_GUIDANCE =
  '\n\nTool rules: when the task deliverable is a document, save the finished document with the ' +
  'write_document tool (full content) — that is how work is delivered. If the task explicitly asks ' +
  'you to send or announce a message outside this system, you MUST use the send_external_message ' +
  'tool; it will pause for human approval, which is expected — do not work around it. ' +
  'Work in the language used by the task instructions. When everything is done, reply with a one-line summary.'

export class TaskEngine {
  private busy = false
  private waiters = new Map<string, (d: 'approved' | 'rejected') => void>()

  constructor(
    private repo: AsyncRepository,
    private llm: CompatibleLLM,
    private artifactsDir: string,
    private keyConfigured: boolean,
    // Worker runtime only: artifact bodies go to this store (D1) instead
    // of the local filesystem. Undefined locally — fs path unchanged.
    private artifactStore?: ArtifactStore,
  ) {}

  start() {
    setInterval(() => void this.tick(), 1000)
    void this.tick()
  }

  /**
   * One drain pass of the queue, for runtimes without a persistent timer
   * (the Durable Object calls this on request kicks and alarms). Local
   * mode uses start()'s interval instead. Same busy-guard, same semantics.
   */
  async pump(): Promise<void> {
    await this.tick()
  }

  /** Called by the API when a human decides an approval. */
  decide(approvalId: string, decision: 'approved' | 'rejected') {
    const w = this.waiters.get(approvalId)
    if (w) {
      this.waiters.delete(approvalId)
      w(decision)
    }
  }

  private waitForDecision(approvalId: string): Promise<'approved' | 'rejected'> {
    return new Promise((resolve) => this.waiters.set(approvalId, resolve))
  }

  private async tick() {
    if (this.busy) return
    const task = await this.repo.nextQueuedTask()
    if (!task) return
    this.busy = true
    try {
      await this.execute(task)
    } catch (err) {
      console.error('[engine] unexpected error', err)
    } finally {
      this.busy = false
    }
  }

  private async emitTask(taskId: string, type: WorkEventType, agentId: string, payload?: Record<string, string | number | boolean>) {
    await this.repo.addTaskEvent(taskId, type, payload ?? {})
    emit(type, agentId, taskId, payload)
  }

  private async execute(task: TaskRow) {
    const agent = await this.repo.getAgent(task.agentId)
    const run: RunRow = {
      id: randomUUID(),
      taskId: task.id,
      agentId: task.agentId,
      runNumber: await this.repo.countRuns(task.id) + 1,
      provider: agent?.config.provider ?? 'kenari',
      model: agent?.config.model ?? this.llm.modelName,
      status: 'running',
      startedAt: now(),
      endedAt: null,
      error: null,
    }
    await this.repo.createRun(run)
    await this.repo.setTaskStatus(task.id, 'running')
    await this.repo.addActivity('system', 'run.started', run.id, `Run #${run.runNumber} for "${task.title}"`)

    try {
      if (!agent) throw new Error(`Agent ${task.agentId} not found`)
      if (!agent.isActive) throw new Error(`Agent ${agent.name} is deactivated`)
      if (!this.keyConfigured) throw new Error('KENARI_API_KEY not configured — start the orchestrator via run.py')

      await this.emitTask(task.id, 'task.assigned', agent.id, { title: task.title, provider: run.provider, model: run.model })
      // The avatar walks to its desk on this event; the run proceeds after.
      await sleep(5000)
      await this.emitTask(task.id, 'task.started', agent.id)

      const messages: TurnMessage[] = [
        { role: 'system', content: agent.config.systemPrompt + TOOL_GUIDANCE },
        { role: 'user', content: `Task: ${task.title}\n\n${task.instructions}` },
      ]
      let artifactFile: string | undefined
      let totalIn = 0
      let totalOut = 0
      let finalText = ''

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        await this.emitTask(task.id, 'run.thinking', agent.id, { provider: run.provider, model: run.model, turn: turn + 1 })
        const res = await this.llm.chatTurn(messages, toolDefsFor(agent.config.allowedTools), {
          temperature: agent.config.temperature,
          model: run.model,
          maxTokens: 6000,
          timeoutMs: 180_000,
        })
        totalIn += res.usage?.prompt_tokens ?? 0
        totalOut += res.usage?.completion_tokens ?? 0
        await this.repo.addUsage({
          id: randomUUID(), agentId: agent.id, runId: run.id, provider: run.provider, model: res.model,
          tokensIn: res.usage?.prompt_tokens ?? 0, tokensOut: res.usage?.completion_tokens ?? 0,
          costUsd: estimateCostUsd(res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0),
          latencyMs: res.latencyMs, createdAt: now(),
        })

        if (res.toolCalls.length === 0) {
          finalText = res.content
          break
        }
        messages.push({
          role: 'assistant',
          content: res.content,
          tool_calls: res.toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.rawArguments } })),
        })
        for (const call of res.toolCalls) {
          const out = await this.handleToolCall(run, task, agent.id, agent.config.allowedTools, call)
          if (out.artifactFile) artifactFile = out.artifactFile
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.result) })
        }
      }

      // Deliverable fallback: the model finished with prose but never saved
      // it. The engine saves that exact text through the same executor and
      // records the tool call as an engine fallback — nothing is invented.
      if (!artifactFile && finalText.trim().length > 40) {
        const spec = TOOLS.write_document
        const t0 = Date.now()
        const res = await spec.execute({ title: task.title, content: finalText }, { artifactsDir: this.artifactsDir, taskId: task.id, store: this.artifactStore })
        await this.repo.addToolCall({
          id: randomUUID(), runId: run.id, toolName: 'write_document',
          argsSummary: 'Final answer saved as artifact (engine fallback — model did not call the tool)',
          resultStatus: 'ok_engine_fallback', durationMs: Date.now() - t0,
          requiresApproval: false, approvalId: null, createdAt: now(),
        })
        if (res.artifact) {
          artifactFile = res.artifact.fileName
          await this.repo.addArtifact({
            id: randomUUID(), taskId: task.id, runId: run.id, agentId: agent.id,
            kind: 'doc', title: res.artifact.title, fileName: res.artifact.fileName, createdAt: now(),
          })
        }
      }

      await this.repo.updateRun(run.id, { status: 'completed', endedAt: now() })
      await this.repo.setTaskStatus(task.id, 'completed')
      await this.emitTask(task.id, 'task.completed', agent.id, {
        artifact: artifactFile ?? '',
        model: run.model, tokensIn: totalIn, tokensOut: totalOut,
      })
      await this.repo.addActivity('agent', 'task.completed', task.id, `"${task.title}" by ${agent.name} · ${totalIn + totalOut} tokens${artifactFile ? ` · artifact ${artifactFile}` : ''}`)
      await this.repo.addNotification({
        id: randomUUID(), kind: 'task.completed', title: `Task selesai: ${task.title}`,
        detail: `${agent.name} · ${totalIn + totalOut} tokens${artifactFile ? ` · artefak ${artifactFile}` : ''}`,
        entityRef: task.id, agentId: agent.id, isRead: false, createdAt: now(),
      })
      broadcastControl('notification', { kind: 'task.completed', taskId: task.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.repo.updateRun(run.id, { status: 'failed', endedAt: now(), error: message })
      await this.repo.setTaskStatus(task.id, 'failed')
      await this.emitTask(task.id, 'task.failed', task.agentId, { error: message.slice(0, 200) })
      await this.repo.addActivity('system', 'task.failed', task.id, `"${task.title}" — ${message.slice(0, 160)}`)
      await this.repo.addNotification({
        id: randomUUID(), kind: 'task.failed', title: `Task gagal: ${task.title}`,
        detail: message.slice(0, 200), entityRef: task.id, agentId: task.agentId,
        isRead: false, createdAt: now(),
      })
      broadcastControl('notification', { kind: 'task.failed', taskId: task.id })
    }
  }

  private async handleToolCall(
    run: RunRow,
    task: TaskRow,
    agentId: string,
    allowedTools: string[],
    call: ToolCallRequest,
  ): Promise<{ result: unknown; artifactFile?: string }> {
    const spec = TOOLS[call.name]
    if (!spec) {
      await this.repo.addToolCall({
        id: randomUUID(), runId: run.id, toolName: call.name, argsSummary: '',
        resultStatus: 'unknown_tool', durationMs: 0, requiresApproval: false, approvalId: null, createdAt: now(),
      })
      return { result: { ok: false, error: `Unknown tool: ${call.name}` } }
    }
    if (!allowedTools.includes(call.name)) {
      await this.repo.addToolCall({
        id: randomUUID(), runId: run.id, toolName: call.name, argsSummary: spec.summarize(call.args),
        resultStatus: 'denied_permission', durationMs: 0, requiresApproval: false, approvalId: null, createdAt: now(),
      })
      await this.repo.addActivity('system', 'tool.denied', run.id, `${call.name} not in ${agentId}'s allowed tools`)
      return { result: { ok: false, error: `Tool ${call.name} is not permitted for this agent.` } }
    }

    // ── Approval gate: sensitive tools pause the run until a human decides ──
    let toolCallId = randomUUID()
    if (spec.sensitive) {
      const approvalId = randomUUID()
      await this.repo.createApproval({
        id: approvalId, taskId: task.id, runId: run.id, toolCallId: toolCallId,
        actionSummary: spec.summarize(call.args), status: 'pending', createdAt: now(), decidedAt: null,
      })
      await this.repo.addToolCall({
        id: toolCallId, runId: run.id, toolName: call.name, argsSummary: spec.summarize(call.args),
        resultStatus: 'waiting_approval', durationMs: null, requiresApproval: true, approvalId, createdAt: now(),
      })
      await this.repo.setTaskStatus(task.id, 'waiting_approval')
      await this.repo.updateRun(run.id, { status: 'waiting_approval' })
      await this.emitTask(task.id, 'run.waiting_input', agentId, { tool: call.name, approvalId })
      await this.repo.addActivity('system', 'approval.requested', approvalId, spec.summarize(call.args))
      await this.repo.addNotification({
        id: randomUUID(), kind: 'approval.pending', title: 'Approval menunggu keputusan',
        detail: spec.summarize(call.args), entityRef: approvalId, agentId,
        isRead: false, createdAt: now(),
      })
      broadcastControl('approval', { approvalId, taskId: task.id })
      broadcastControl('notification', { kind: 'approval.pending', approvalId })

      const decision = await this.waitForDecision(approvalId)

      await this.repo.setTaskStatus(task.id, 'running')
      await this.repo.updateRun(run.id, { status: 'running' })
      if (decision === 'rejected') {
        await this.repo.updateToolCall(toolCallId, { resultStatus: 'rejected', durationMs: 0 })
        await this.repo.addActivity('user', 'approval.rejected', approvalId, spec.summarize(call.args))
        return {
          result: {
            ok: false, rejected: true,
            note: 'The user REJECTED this action. Do not retry it and do not work around it. Continue the task without it and mention the rejection in your summary.',
          },
        }
      }
      await this.repo.addActivity('user', 'approval.approved', approvalId, spec.summarize(call.args))
    } else {
      await this.repo.addToolCall({
        id: toolCallId, runId: run.id, toolName: call.name, argsSummary: spec.summarize(call.args),
        resultStatus: 'running', durationMs: null, requiresApproval: false, approvalId: null, createdAt: now(),
      })
    }

    await this.emitTask(task.id, 'tool.started', agentId, { tool: call.name })
    const t0 = Date.now()
    try {
      const res = await spec.execute(call.args, { artifactsDir: this.artifactsDir, taskId: task.id, store: this.artifactStore })
      await this.repo.updateToolCall(toolCallId, { resultStatus: res.resultStatus, durationMs: Date.now() - t0 })
      if (res.artifact) {
        await this.repo.addArtifact({
          id: randomUUID(), taskId: task.id, runId: run.id, agentId,
          kind: 'doc', title: res.artifact.title, fileName: res.artifact.fileName, createdAt: now(),
        })
      }
      await this.emitTask(task.id, 'tool.finished', agentId, { tool: call.name, artifact: res.artifact?.fileName ?? '' })
      await this.repo.addActivity('agent', 'tool.executed', run.id, `${call.name} → ${res.resultStatus}`)
      return { result: res.result, artifactFile: res.artifact?.fileName }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.repo.updateToolCall(toolCallId, { resultStatus: 'error', durationMs: Date.now() - t0 })
      await this.emitTask(task.id, 'tool.finished', agentId, { tool: call.name, error: true })
      return { result: { ok: false, error: message } }
    }
  }
}
