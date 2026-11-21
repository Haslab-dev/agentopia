import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CompatibleLLM } from './llm/compatible'
import { runLiveProof, type ProofResult } from './proof'
import { SqliteRepository, type Repository } from './db'
import { SupabaseRepository } from './db/supabase-repository'
import { TaskEngine } from './engine'
import { MeetingEngine } from './meetings'
import { broadcastControl, emit, eventsResponse } from './events'
import { PRICING_NOTE } from './pricing'

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — Phase 3 agent engine (ARCHITECTURE.md §1.1, §6 Fase 3).
// Task engine + SQLite persistence (Repository interface; Supabase is the
// prepared-but-unconnected implementation) + tool registry with approval
// gate + usage tracking. Work status leaves ONLY as frozen §1.3 events
// over SSE. The Kenari key exists solely as process env (run.py launcher,
// Secure Vault surrogate) — never in code, logs, DB, or the browser.
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8787)
const BASE_URL = process.env.KENARI_BASE_URL ?? 'https://kenari.id/v1'
const MODEL = process.env.KENARI_MODEL ?? 'deepseek-v4-1-flash'
const API_KEY = process.env.KENARI_API_KEY ?? ''
const ROOT = join(import.meta.dir, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts')
const DB_PATH = process.env.LW_DB_PATH ?? join(ROOT, 'data', 'living-world.db')

let repo: Repository
if (process.env.REPO === 'supabase') {
  try {
    repo = new SupabaseRepository()
  } catch (err) {
    console.error(`[orchestrator] ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
} else {
  repo = new SqliteRepository(DB_PATH, MODEL)
}
const recovered = repo!.recoverInterruptedRuns()
if (recovered > 0) {
  repo!.addActivity('system', 'engine.recovered', 'orchestrator', `${recovered} interrupted run/task rows marked failed after restart`)
  console.log(`[orchestrator] recovered ${recovered} interrupted rows (marked failed, honestly)`)
}

const llm = new CompatibleLLM(BASE_URL, API_KEY, MODEL)
const engine = new TaskEngine(repo!, llm, ARTIFACTS_DIR, API_KEY.length > 0)
engine.start()
const meetings = new MeetingEngine(repo!, llm, ARTIFACTS_DIR, API_KEY.length > 0)

// ── HTTP API ─────────────────────────────────────────────────────────────────
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })

let proofRunning = false
let lastProof: ProofResult | null = null

const PALETTE = ['#e07a9b', '#5f9e6e', '#7fb3e0', '#f59e4c', '#6ec3c9', '#b48ce0', '#e0654f', '#9db38a']

// Fase 7: minimal write rate limit — per client IP, fixed 60 s window.
// Generous for the real UI (a human clicks a few writes a minute), tight
// enough that a script cannot hammer task/meeting creation (each of which
// can spend real LLM tokens). GETs and the SSE stream are never limited.
const WRITE_LIMIT_PER_MIN = 30
const writeHits = new Map<string, { count: number; resetAt: number }>()

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // SSE streams are long-lived; heartbeats keep them active
  async fetch(req, srv) {
    const url = new URL(req.url)
    const path = url.pathname
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

    if (req.method === 'POST' || req.method === 'PATCH') {
      const ip = srv.requestIP(req)?.address ?? 'unknown'
      const nowMs = Date.now()
      const w = writeHits.get(ip)
      if (!w || nowMs >= w.resetAt) {
        writeHits.set(ip, { count: 1, resetAt: nowMs + 60_000 })
      } else if (++w.count > WRITE_LIMIT_PER_MIN) {
        return json({ ok: false, error: 'Rate limit: too many write requests — slow down' }, 429)
      }
    }

    try {
      if (path === '/health') {
        return json({
          ok: true, phase: 4, provider: 'kenari', baseUrl: BASE_URL, model: MODEL,
          keyConfigured: API_KEY.length > 0, repository: process.env.REPO ?? 'sqlite',
          agents: repo.listAgents().length, tasks: repo.listTasks(1000).length,
          meetings: repo.listMeetings(1000).length, meetingRunning: meetings.isRunning(),
          unreadNotifications: repo.unreadNotificationCount(), lastProof,
        })
      }

      if (path === '/events') {
        const res = eventsResponse(MODEL)
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
        return res
      }

      // ── §7 proof (kept intact as the regression path) ──────────────────────
      if (path === '/run-live-proof' && req.method === 'POST') {
        if (!API_KEY) return json({ ok: false, error: 'KENARI_API_KEY not configured — start the orchestrator via run.py (custom.kenari connector).' }, 500)
        if (proofRunning) return json({ ok: false, error: 'A live proof run is already in progress.' }, 409)
        proofRunning = true
        const taskId = `live-${Date.now()}`
        runLiveProof(llm, emit, ARTIFACTS_DIR)
          .then((r) => { lastProof = r })
          .catch((err) => { lastProof = { ok: false, taskId, error: String(err) } })
          .finally(() => { proofRunning = false })
        return json({ ok: true, started: true, note: 'Progress arrives on /events; completion is only claimed there.' })
      }

      if (path === '/artifact') {
        const name = basename(url.searchParams.get('name') ?? '')
        if (!name.endsWith('.md')) return new Response('Bad artifact name', { status: 400, headers: cors })
        try {
          const text = await readFile(join(ARTIFACTS_DIR, name), 'utf8')
          return new Response(text, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } })
        } catch {
          return new Response('Artifact not found', { status: 404, headers: cors })
        }
      }

      // ── Agents ─────────────────────────────────────────────────────────────
      if (path === '/agents' && req.method === 'GET') {
        const usage = new Map(repo.usageToday().map((u) => [u.agentId, u]))
        return json({
          agents: repo.listAgents().map((a) => ({
            ...a,
            usageToday: usage.get(a.id) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
          })),
        })
      }
      if (path === '/agents' && req.method === 'POST') {
        const body = (await req.json()) as { name?: string; role?: string; description?: string; model?: string; systemPrompt?: string }
        if (!body.name?.trim() || !body.role?.trim()) return json({ ok: false, error: 'name and role are required' }, 400)
        const count = repo.listAgents().length
        const id = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${randomUUID().slice(0, 4)}`
        const color = PALETTE[count % PALETTE.length]
        const agent = repo.createAgent(
          {
            id, name: body.name.trim(), role: body.role.trim(), description: body.description ?? '',
            shirt: color, pants: '#3c4a5a', hair: '#2b2320', skin: '#e8b08a', deskIndex: 100 + count,
            isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          },
          {
            agentId: id, provider: 'kenari', model: body.model ?? MODEL, temperature: 0.7,
            systemPrompt: body.systemPrompt ?? `Kamu adalah ${body.name.trim()}, ${body.role.trim()} di tim AI kampus virtual.`,
            allowedTools: ['write_document', 'read_artifact'], workspace: `agents/${id}`,
          },
        )
        repo.addActivity('user', 'agent.created', id, `${agent.name} (${agent.role})`)
        return json({ ok: true, agent }, 201)
      }
      const agentMatch = path.match(/^\/agents\/([^/]+)$/)
      if (agentMatch && req.method === 'PATCH') {
        const body = (await req.json()) as {
          name?: string; role?: string; description?: string; isActive?: boolean
          config?: { provider?: string; model?: string; temperature?: number; systemPrompt?: string; allowedTools?: string[]; workspace?: string }
        }
        const updated = repo.updateAgent(agentMatch[1], {
          name: body.name, role: body.role, description: body.description, isActive: body.isActive,
        }, body.config ?? {})
        if (!updated) return json({ ok: false, error: 'Agent not found' }, 404)
        repo.addActivity('user', 'agent.updated', updated.id, `${updated.name} config saved (model ${updated.config.model})`)
        return json({ ok: true, agent: updated })
      }

      // ── Tasks ──────────────────────────────────────────────────────────────
      if (path === '/tasks' && req.method === 'GET') {
        return json({
          tasks: repo.listTasks(50).map((t) => ({
            ...t,
            runs: repo.listRuns(t.id),
            artifacts: repo.listArtifacts(t.id),
          })),
        })
      }
      if (path === '/tasks' && req.method === 'POST') {
        const body = (await req.json()) as { title?: string; instructions?: string; agentId?: string; priority?: string }
        if (!body.title?.trim() || !body.instructions?.trim() || !body.agentId) {
          return json({ ok: false, error: 'title, instructions and agentId are required' }, 400)
        }
        const agent = repo.getAgent(body.agentId)
        if (!agent) return json({ ok: false, error: `Agent ${body.agentId} not found` }, 400)
        if (!agent.isActive) return json({ ok: false, error: `Agent ${agent.name} is deactivated` }, 400)
        const task = repo.createTask({
          id: randomUUID(), title: body.title.trim(), instructions: body.instructions.trim(),
          agentId: body.agentId,
          priority: (['low', 'normal', 'high'].includes(body.priority ?? '') ? body.priority : 'normal') as 'low' | 'normal' | 'high',
          status: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        })
        repo.addActivity('user', 'task.created', task.id, `"${task.title}" → ${agent.name}`)
        return json({ ok: true, task }, 201)
      }
      const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
      if (taskMatch && req.method === 'GET') {
        const task = repo.getTask(taskMatch[1])
        if (!task) return json({ ok: false, error: 'Task not found' }, 404)
        const runs = repo.listRuns(task.id).map((r) => ({ ...r, toolCalls: repo.listToolCalls(r.id) }))
        return json({ task, runs, artifacts: repo.listArtifacts(task.id), events: repo.listTaskEvents(task.id) })
      }
      const retryMatch = path.match(/^\/tasks\/([^/]+)\/retry$/)
      if (retryMatch && req.method === 'POST') {
        const task = repo.getTask(retryMatch[1])
        if (!task) return json({ ok: false, error: 'Task not found' }, 404)
        if (!['failed', 'completed', 'cancelled'].includes(task.status)) {
          return json({ ok: false, error: `Task is ${task.status} — only finished tasks can be retried` }, 409)
        }
        repo.setTaskStatus(task.id, 'queued')
        repo.addActivity('user', 'task.retry', task.id, `"${task.title}" re-queued as a new run`)
        return json({ ok: true, task: repo.getTask(task.id) })
      }

      // ── Approvals ──────────────────────────────────────────────────────────
      if (path === '/approvals' && req.method === 'GET') {
        return json({ approvals: repo.listApprovals(url.searchParams.get('status') ?? undefined) })
      }
      const decideMatch = path.match(/^\/approvals\/([^/]+)\/decide$/)
      if (decideMatch && req.method === 'POST') {
        const body = (await req.json()) as { decision?: string }
        if (body.decision !== 'approved' && body.decision !== 'rejected') {
          return json({ ok: false, error: 'decision must be "approved" or "rejected"' }, 400)
        }
        const before = repo.getApproval(decideMatch[1])
        if (!before) return json({ ok: false, error: 'Approval not found' }, 404)
        const decided = repo.decideApproval(decideMatch[1], body.decision)
        if (before.status === 'pending') {
          engine.decide(decideMatch[1], body.decision) // wake the paused run
          broadcastControl('approval-decided', { approvalId: decideMatch[1], decision: body.decision })
        }
        return json({ ok: true, approval: decided })
      }

      // ── Meetings (Phase 4) ─────────────────────────────────────────────────
      if (path === '/meetings' && req.method === 'GET') {
        return json({ meetings: repo.listMeetings(30), running: meetings.isRunning() })
      }
      if (path === '/meetings' && req.method === 'POST') {
        const body = (await req.json()) as { topic?: string; participantIds?: string[]; rounds?: number }
        const topic = body.topic?.trim() ?? ''
        const ids = [...new Set((body.participantIds ?? []).filter((x) => typeof x === 'string'))]
        if (!topic) return json({ ok: false, error: 'topic is required' }, 400)
        if (ids.length < 2 || ids.length > 4) {
          return json({ ok: false, error: 'Pick 2–4 participants' }, 400)
        }
        for (const id of ids) {
          const a = repo.getAgent(id)
          if (!a) return json({ ok: false, error: `Agent ${id} not found` }, 400)
          if (!a.isActive) return json({ ok: false, error: `Agent ${a.name} is deactivated` }, 400)
        }
        if (meetings.isRunning()) return json({ ok: false, error: 'A meeting is already running' }, 409)
        const rounds = Math.min(3, Math.max(1, Math.round(body.rounds ?? 2)))
        try {
          const meeting = meetings.start({ topic, participantIds: ids, rounds })
          return json({ ok: true, meeting }, 201)
        } catch (err) {
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
        }
      }
      const meetingMatch = path.match(/^\/meetings\/([^/]+)$/)
      if (meetingMatch && req.method === 'GET') {
        const meeting = repo.getMeeting(meetingMatch[1])
        if (!meeting) return json({ ok: false, error: 'Meeting not found' }, 404)
        return json({ meeting, messages: repo.listMeetingMessages(meeting.id) })
      }

      // ── Notifications (Phase 4) ────────────────────────────────────────────
      if (path === '/notifications' && req.method === 'GET') {
        return json({
          notifications: repo.listNotifications(Number(url.searchParams.get('limit') ?? 50)),
          unread: repo.unreadNotificationCount(),
        })
      }
      if (path === '/notifications/read-all' && req.method === 'POST') {
        repo.markAllNotificationsRead()
        return json({ ok: true, unread: 0 })
      }
      const notifMatch = path.match(/^\/notifications\/([^/]+)\/read$/)
      if (notifMatch && req.method === 'POST') {
        repo.markNotificationRead(notifMatch[1])
        return json({ ok: true, unread: repo.unreadNotificationCount() })
      }

      // ── Activity & usage ───────────────────────────────────────────────────
      if (path === '/activity' && req.method === 'GET') {
        return json({ activity: repo.listActivity(Number(url.searchParams.get('limit') ?? 60)) })
      }
      if (path === '/usage' && req.method === 'GET') {
        const byAgent = repo.usageToday()
        return json({
          byAgent,
          total: {
            tokensIn: byAgent.reduce((s, u) => s + u.tokensIn, 0),
            tokensOut: byAgent.reduce((s, u) => s + u.tokensOut, 0),
            costUsd: byAgent.reduce((s, u) => s + u.costUsd, 0),
            calls: byAgent.reduce((s, u) => s + u.calls, 0),
          },
          pricingNote: PRICING_NOTE,
        })
      }
      if (path === '/artifacts' && req.method === 'GET') {
        return json({ artifacts: repo.listArtifacts() })
      }

      return new Response('Not found', { status: 404, headers: cors })
    } catch (err) {
      // Fase 7: a malformed JSON body is a client error (400), not a crash.
      if (err instanceof SyntaxError) {
        return json({ ok: false, error: 'Request body is not valid JSON' }, 400)
      }
      console.error('[orchestrator] request error', err)
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
  },
})

console.log(`[orchestrator] Phase 3 engine on http://localhost:${server.port} · provider=kenari model=${MODEL} keyConfigured=${API_KEY.length > 0} repo=${process.env.REPO ?? 'sqlite'}`)
