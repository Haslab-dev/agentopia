import { SEED_AGENTS, DEFAULT_TOOLS } from './seed'
import {
  type AgentConfigRow,
  type AgentRow,
  type AgentWithConfig,
  type ApprovalRow,
  type ArtifactRow,
  type MeetingRow,
  type MeetingMessageRow,
  type NotificationRow,
  type RunRow,
  type TaskRow,
  type TaskStatus,
  type RunStatus,
  type MeetingStatus,
  type ToolCallRow,
  type UsageRow,
  type ActivityRow,
  type TaskEventRow,
} from '../db'
import type { AsyncRepository } from './async-repository'

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare D1 repository — the cloud implementation of the persistence
// surface (ARCHITECTURE.md §1.1, §4; Lutfi's Cloudflare Stack decision,
// 2026-11-21). It implements AsyncRepository (db/async-repository.ts): the
// Repository interface of db.ts with Promise returns, because D1 is only
// reachable through async calls from the Worker runtime.
//
// The SQL below is the SqliteRepository SQL carried over 1:1 — D1 speaks
// the same SQLite dialect, the schema in cloudflare/d1/migrations/ was
// derived from the same DDL, and the row-mapping rules (0/1 booleans,
// JSON text columns) are identical. What runs locally on bun:sqlite runs
// here on D1, row for row.
//
// The structural D1 types are declared locally instead of depending on
// @cloudflare/workers-types: the binding surface used here is ~20 lines.
// ─────────────────────────────────────────────────────────────────────────────

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta?: { changes?: number; rows_written?: number } }>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>
}

const now = () => new Date().toISOString()
type Row = Record<string, unknown>

export class D1Repository implements AsyncRepository {
  constructor(
    private db: D1DatabaseLike,
    private defaultModel: string,
  ) {}

  /**
   * First-boot seed: the 10 campus agents become real rows, exactly as
   * SqliteRepository seeds its local file. Idempotent — a no-op once any
   * agent exists. Called by the Worker/DO on cold start.
   */
  async ensureSeeded(): Promise<void> {
    const count = await this.db.prepare('SELECT COUNT(*) AS n FROM agents').first<{ n: number }>()
    if ((count?.n ?? 0) > 0) return
    const statements: D1PreparedStatementLike[] = []
    for (const a of SEED_AGENTS) {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO agents (id, name, role, description, shirt, pants, hair, skin, desk_index, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
          )
          .bind(a.id, a.name, a.role, a.description, a.shirt, a.pants, a.hair, a.skin, a.deskIndex, now(), now()),
      )
      statements.push(
        this.db
          .prepare(
            'INSERT INTO agent_configs (agent_id, provider, model, temperature, system_prompt, allowed_tools, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(a.id, 'kenari', this.defaultModel, 0.7, a.prompt, JSON.stringify(DEFAULT_TOOLS), `agents/${a.id}`),
      )
    }
    await this.db.batch(statements)
  }

  // ── agents ────────────────────────────────────────────────────────────────
  private joinAgent(row: Row, c: Row | null): AgentWithConfig {
    return {
      id: row.id as string, name: row.name as string, role: row.role as string,
      description: row.description as string, shirt: row.shirt as string, pants: row.pants as string,
      hair: row.hair as string, skin: row.skin as string, deskIndex: row.desk_index as number,
      isActive: (row.is_active as number) === 1, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
      config: {
        agentId: row.id as string,
        provider: (c?.provider as string) ?? 'kenari',
        model: (c?.model as string) ?? this.defaultModel,
        temperature: (c?.temperature as number) ?? 0.7,
        systemPrompt: (c?.system_prompt as string) ?? '',
        allowedTools: JSON.parse(((c?.allowed_tools as string) ?? '[]')) as string[],
        workspace: (c?.workspace as string) ?? '',
      },
    }
  }

  async listAgents(): Promise<AgentWithConfig[]> {
    const { results: rows } = await this.db.prepare('SELECT * FROM agents ORDER BY desk_index').all<Row>()
    const { results: configs } = await this.db.prepare('SELECT * FROM agent_configs').all<Row>()
    const byAgent = new Map(configs.map((c) => [c.agent_id as string, c]))
    return rows.map((r) => this.joinAgent(r, byAgent.get(r.id as string) ?? null))
  }

  async getAgent(id: string): Promise<AgentWithConfig | null> {
    const row = await this.db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first<Row>()
    if (!row) return null
    const c = await this.db.prepare('SELECT * FROM agent_configs WHERE agent_id = ?').bind(id).first<Row>()
    return this.joinAgent(row, c)
  }

  async createAgent(a: AgentRow, c: AgentConfigRow): Promise<AgentWithConfig> {
    await this.db
      .prepare(
        'INSERT INTO agents (id, name, role, description, shirt, pants, hair, skin, desk_index, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(a.id, a.name, a.role, a.description, a.shirt, a.pants, a.hair, a.skin, a.deskIndex, a.isActive ? 1 : 0, a.createdAt, a.updatedAt)
      .run()
    await this.db
      .prepare(
        'INSERT INTO agent_configs (agent_id, provider, model, temperature, system_prompt, allowed_tools, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(c.agentId, c.provider, c.model, c.temperature, c.systemPrompt, JSON.stringify(c.allowedTools), c.workspace)
      .run()
    return (await this.getAgent(a.id))!
  }

  async updateAgent(id: string, p: Partial<AgentRow>, c: Partial<AgentConfigRow>): Promise<AgentWithConfig | null> {
    const cur = await this.getAgent(id)
    if (!cur) return null
    // Partial bodies carry explicit undefined for untouched fields — strip
    // them, or they would overwrite stored values with undefined.
    const clean = <T extends object>(o: T): Partial<T> =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
    const next: AgentWithConfig = {
      ...cur, ...clean(p), config: { ...cur.config, ...clean(c) },
    }
    await this.db
      .prepare('UPDATE agents SET name=?, role=?, description=?, is_active=?, updated_at=? WHERE id=?')
      .bind(next.name, next.role, next.description, next.isActive ? 1 : 0, now(), id)
      .run()
    await this.db
      .prepare('UPDATE agent_configs SET provider=?, model=?, temperature=?, system_prompt=?, allowed_tools=?, workspace=? WHERE agent_id=?')
      .bind(next.config.provider, next.config.model, next.config.temperature, next.config.systemPrompt, JSON.stringify(next.config.allowedTools), next.config.workspace, id)
      .run()
    return this.getAgent(id)
  }

  // ── tasks & runs ──────────────────────────────────────────────────────────
  async createTask(t: TaskRow): Promise<TaskRow> {
    await this.db
      .prepare(
        'INSERT INTO tasks (id, title, instructions, agent_id, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(t.id, t.title, t.instructions, t.agentId, t.priority, t.status, t.createdAt, t.updatedAt)
      .run()
    return t
  }

  private taskRow(r: Row): TaskRow {
    return {
      id: r.id as string, title: r.title as string, instructions: r.instructions as string,
      agentId: r.agent_id as string, priority: r.priority as TaskRow['priority'],
      status: r.status as TaskStatus, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    }
  }

  async getTask(id: string): Promise<TaskRow | null> {
    const r = await this.db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Row>()
    return r ? this.taskRow(r) : null
  }

  async listTasks(limit: number): Promise<TaskRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?').bind(limit).all<Row>()
    return results.map((r) => this.taskRow(r))
  }

  async setTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run()
  }

  async nextQueuedTask(): Promise<TaskRow | null> {
    const r = await this.db
      .prepare(
        "SELECT * FROM tasks WHERE status = 'queued' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at ASC LIMIT 1",
      )
      .first<Row>()
    return r ? this.taskRow(r) : null
  }

  async createRun(r: RunRow): Promise<RunRow> {
    await this.db
      .prepare(
        'INSERT INTO agent_runs (id, task_id, agent_id, run_number, provider, model, status, started_at, ended_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(r.id, r.taskId, r.agentId, r.runNumber, r.provider, r.model, r.status, r.startedAt, r.endedAt, r.error)
      .run()
    return r
  }

  async updateRun(id: string, patch: Partial<RunRow>): Promise<void> {
    const cur = await this.getRun(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    await this.db.prepare('UPDATE agent_runs SET status = ?, ended_at = ?, error = ? WHERE id = ?').bind(n.status, n.endedAt, n.error, id).run()
  }

  private runRow(r: Row): RunRow {
    return {
      id: r.id as string, taskId: r.task_id as string, agentId: r.agent_id as string,
      runNumber: r.run_number as number, provider: r.provider as string, model: r.model as string,
      status: r.status as RunStatus, startedAt: r.started_at as string,
      endedAt: (r.ended_at as string) ?? null, error: (r.error as string) ?? null,
    }
  }

  async getRun(id: string): Promise<RunRow | null> {
    const r = await this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').bind(id).first<Row>()
    return r ? this.runRow(r) : null
  }

  async listRuns(taskId: string): Promise<RunRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY run_number ASC').bind(taskId).all<Row>()
    return results.map((r) => this.runRow(r))
  }

  async countRuns(taskId: string): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM agent_runs WHERE task_id = ?').bind(taskId).first<{ n: number }>()
    return r?.n ?? 0
  }

  async recoverInterruptedRuns(): Promise<number> {
    // Same honest recovery as the local repository: rows left mid-flight
    // by a dead runtime are marked failed, never resurrected as completed.
    const t = now()
    let changes = 0
    for (const sql of [
      "UPDATE agent_runs SET status = 'failed', ended_at = ?, error = 'Orchestrator restarted mid-run' WHERE status IN ('running', 'waiting_approval')",
      "UPDATE tasks SET status = 'failed', updated_at = ? WHERE status IN ('running', 'waiting_approval')",
      "UPDATE approvals SET status = 'rejected', decided_at = ? WHERE status = 'pending'",
      "UPDATE meetings SET status = 'failed', ended_at = ?, error = 'Orchestrator restarted mid-meeting' WHERE status = 'running'",
    ]) {
      const res = await this.db.prepare(sql).bind(t).run()
      changes += res.meta?.changes ?? res.meta?.rows_written ?? 0
    }
    return changes
  }

  // ── tools & approvals ─────────────────────────────────────────────────────
  async addToolCall(t: ToolCallRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO tool_calls (id, run_id, tool_name, args_summary, result_status, duration_ms, requires_approval, approval_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(t.id, t.runId, t.toolName, t.argsSummary, t.resultStatus, t.durationMs, t.requiresApproval ? 1 : 0, t.approvalId, t.createdAt)
      .run()
  }

  async updateToolCall(id: string, patch: Partial<ToolCallRow>): Promise<void> {
    const cur = await this.db.prepare('SELECT * FROM tool_calls WHERE id = ?').bind(id).first<Row>()
    if (!cur) return
    await this.db
      .prepare('UPDATE tool_calls SET result_status = ?, duration_ms = ? WHERE id = ?')
      .bind(patch.resultStatus ?? (cur.result_status as string), patch.durationMs ?? (cur.duration_ms as number | null), id)
      .run()
  }

  async listToolCalls(runId: string): Promise<ToolCallRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM tool_calls WHERE run_id = ? ORDER BY created_at ASC').bind(runId).all<Row>()
    return results.map((r) => ({
      id: r.id as string, runId: r.run_id as string, toolName: r.tool_name as string,
      argsSummary: r.args_summary as string, resultStatus: r.result_status as string,
      durationMs: (r.duration_ms as number) ?? null, requiresApproval: (r.requires_approval as number) === 1,
      approvalId: (r.approval_id as string) ?? null, createdAt: r.created_at as string,
    }))
  }

  async createApproval(a: ApprovalRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO approvals (id, task_id, run_id, tool_call_id, action_summary, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(a.id, a.taskId, a.runId, a.toolCallId, a.actionSummary, a.status, a.createdAt, a.decidedAt)
      .run()
  }

  private approvalRow(r: Row): ApprovalRow {
    return {
      id: r.id as string, taskId: r.task_id as string, runId: r.run_id as string,
      toolCallId: r.tool_call_id as string, actionSummary: r.action_summary as string,
      status: r.status as ApprovalRow['status'], createdAt: r.created_at as string,
      decidedAt: (r.decided_at as string) ?? null,
    }
  }

  async getApproval(id: string): Promise<ApprovalRow | null> {
    const r = await this.db.prepare('SELECT * FROM approvals WHERE id = ?').bind(id).first<Row>()
    return r ? this.approvalRow(r) : null
  }

  async decideApproval(id: string, decision: 'approved' | 'rejected'): Promise<ApprovalRow | null> {
    const cur = await this.getApproval(id)
    if (!cur || cur.status !== 'pending') return cur
    await this.db.prepare('UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?').bind(decision, now(), id).run()
    return this.getApproval(id)
  }

  async listApprovals(status?: string): Promise<ApprovalRow[]> {
    const { results } = status
      ? await this.db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC').bind(status).all<Row>()
      : await this.db.prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50').all<Row>()
    return results.map((r) => this.approvalRow(r))
  }

  // ── artifacts, usage, logs ────────────────────────────────────────────────
  async addArtifact(a: ArtifactRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO artifacts (id, task_id, run_id, agent_id, kind, title, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(a.id, a.taskId, a.runId, a.agentId, a.kind, a.title, a.fileName, a.createdAt)
      .run()
  }

  async listArtifacts(taskId?: string): Promise<ArtifactRow[]> {
    const { results } = taskId
      ? await this.db.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC').bind(taskId).all<Row>()
      : await this.db.prepare('SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 50').all<Row>()
    return results.map((r) => ({
      id: r.id as string, taskId: r.task_id as string, runId: r.run_id as string, agentId: r.agent_id as string,
      kind: r.kind as string, title: r.title as string, fileName: r.file_name as string, createdAt: r.created_at as string,
    }))
  }

  async addUsage(u: UsageRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO usage_records (id, agent_id, run_id, provider, model, tokens_in, tokens_out, cost_usd, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(u.id, u.agentId, u.runId, u.provider, u.model, u.tokensIn, u.tokensOut, u.costUsd, u.latencyMs, u.createdAt)
      .run()
  }

  async usageToday(): Promise<{ agentId: string; tokensIn: number; tokensOut: number; costUsd: number; calls: number }[]> {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { results } = await this.db
      .prepare(
        'SELECT agent_id, SUM(tokens_in) AS ti, SUM(tokens_out) AS to_, SUM(cost_usd) AS c, COUNT(*) AS n FROM usage_records WHERE created_at >= ? GROUP BY agent_id',
      )
      .bind(dayStart.toISOString())
      .all<Row>()
    return results.map((r) => ({
      agentId: r.agent_id as string, tokensIn: r.ti as number, tokensOut: r.to_ as number,
      costUsd: r.c as number, calls: r.n as number,
    }))
  }

  async addActivity(actor: ActivityRow['actor'], action: string, entityRef: string, detail: string): Promise<void> {
    await this.db
      .prepare('INSERT INTO activity_logs (actor, action, entity_ref, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(actor, action, entityRef, detail, now())
      .run()
  }

  async listActivity(limit: number): Promise<ActivityRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?').bind(limit).all<Row>()
    return results.map((r) => ({
      id: r.id as number, actor: r.actor as ActivityRow['actor'], action: r.action as string,
      entityRef: r.entity_ref as string, detail: r.detail as string, createdAt: r.created_at as string,
    }))
  }

  async addTaskEvent(taskId: string, eventType: string, payload: unknown): Promise<void> {
    await this.db
      .prepare('INSERT INTO task_events (task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)')
      .bind(taskId, eventType, JSON.stringify(payload ?? {}), now())
      .run()
  }

  async listTaskEvents(taskId: string): Promise<TaskEventRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC').bind(taskId).all<Row>()
    return results.map((r) => ({
      id: r.id as number, taskId: r.task_id as string, eventType: r.event_type as string,
      payload: r.payload as string, createdAt: r.created_at as string,
    }))
  }

  // ── meetings (Phase 4) ────────────────────────────────────────────────────
  private meetingRow(r: Row): MeetingRow {
    return {
      id: r.id as string, topic: r.topic as string,
      participantIds: JSON.parse((r.participant_ids as string) ?? '[]') as string[],
      rounds: r.rounds as number, status: r.status as MeetingStatus,
      artifactFile: (r.artifact_file as string) ?? null, error: (r.error as string) ?? null,
      createdAt: r.created_at as string, endedAt: (r.ended_at as string) ?? null,
    }
  }

  async createMeeting(m: MeetingRow): Promise<MeetingRow> {
    await this.db
      .prepare(
        'INSERT INTO meetings (id, topic, participant_ids, rounds, status, artifact_file, error, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(m.id, m.topic, JSON.stringify(m.participantIds), m.rounds, m.status, m.artifactFile, m.error, m.createdAt, m.endedAt)
      .run()
    return m
  }

  async getMeeting(id: string): Promise<MeetingRow | null> {
    const r = await this.db.prepare('SELECT * FROM meetings WHERE id = ?').bind(id).first<Row>()
    return r ? this.meetingRow(r) : null
  }

  async listMeetings(limit: number): Promise<(MeetingRow & { messageCount: number })[]> {
    const { results } = await this.db
      .prepare(
        'SELECT m.*, (SELECT COUNT(*) FROM meeting_messages mm WHERE mm.meeting_id = m.id) AS mc FROM meetings m ORDER BY m.created_at DESC LIMIT ?',
      )
      .bind(limit)
      .all<Row>()
    return results.map((r) => ({ ...this.meetingRow(r), messageCount: r.mc as number }))
  }

  async updateMeeting(id: string, patch: Partial<MeetingRow>): Promise<void> {
    const cur = await this.getMeeting(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    await this.db
      .prepare('UPDATE meetings SET status = ?, artifact_file = ?, error = ?, ended_at = ? WHERE id = ?')
      .bind(n.status, n.artifactFile, n.error, n.endedAt, id)
      .run()
  }

  async addMeetingMessage(m: MeetingMessageRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO meeting_messages (id, meeting_id, seq, agent_id, kind, content, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(m.id, m.meetingId, m.seq, m.agentId, m.kind, m.content, m.tokensIn, m.tokensOut, m.createdAt)
      .run()
  }

  async listMeetingMessages(meetingId: string): Promise<MeetingMessageRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM meeting_messages WHERE meeting_id = ? ORDER BY seq ASC').bind(meetingId).all<Row>()
    return results.map((r) => ({
      id: r.id as string, meetingId: r.meeting_id as string, seq: r.seq as number,
      agentId: r.agent_id as string, kind: r.kind as MeetingMessageRow['kind'],
      content: r.content as string, tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number, createdAt: r.created_at as string,
    }))
  }

  // ── notifications (Phase 4) ───────────────────────────────────────────────
  async addNotification(n: NotificationRow): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO notifications (id, kind, title, detail, entity_ref, agent_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(n.id, n.kind, n.title, n.detail, n.entityRef, n.agentId, n.isRead ? 1 : 0, n.createdAt)
      .run()
  }

  async listNotifications(limit: number): Promise<NotificationRow[]> {
    const { results } = await this.db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?').bind(limit).all<Row>()
    return results.map((r) => ({
      id: r.id as string, kind: r.kind as NotificationRow['kind'], title: r.title as string,
      detail: r.detail as string, entityRef: r.entity_ref as string,
      agentId: (r.agent_id as string) ?? null, isRead: (r.is_read as number) === 1,
      createdAt: r.created_at as string,
    }))
  }

  async unreadNotificationCount(): Promise<number> {
    const r = await this.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0').first<{ n: number }>()
    return r?.n ?? 0
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(id).run()
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run()
  }
}
