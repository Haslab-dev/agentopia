import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// Persistence for the Phase 3 agent engine (ARCHITECTURE.md §4, subset).
// The engine and API talk ONLY to the Repository interface below. Today's
// local implementation is SQLite (bun:sqlite, zero dependencies, a real
// file on disk that survives process restarts). The cloud implementation
// targets Cloudflare D1 — the same SQLite dialect — in
// db/d1-repository.ts; D1 calls are async, so it implements the mirrored
// AsyncRepository surface in db/async-repository.ts and runs only inside
// the Worker runtime (src/worker.ts; see cloudflare/README.md).
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string
  name: string
  role: string
  description: string
  shirt: string
  pants: string
  hair: string
  skin: string
  deskIndex: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentConfigRow {
  agentId: string
  provider: string
  model: string
  temperature: number
  systemPrompt: string
  allowedTools: string[]
  workspace: string
}

export type AgentWithConfig = AgentRow & { config: AgentConfigRow }

export type TaskStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'

export interface TaskRow {
  id: string
  title: string
  instructions: string
  agentId: string
  priority: 'low' | 'normal' | 'high'
  status: TaskStatus
  createdAt: string
  updatedAt: string
}

export type RunStatus = 'running' | 'waiting_approval' | 'completed' | 'failed'

export interface RunRow {
  id: string
  taskId: string
  agentId: string
  runNumber: number
  provider: string
  model: string
  status: RunStatus
  startedAt: string
  endedAt: string | null
  error: string | null
}

export interface ToolCallRow {
  id: string
  runId: string
  toolName: string
  argsSummary: string
  resultStatus: string
  durationMs: number | null
  requiresApproval: boolean
  approvalId: string | null
  createdAt: string
}

export interface ApprovalRow {
  id: string
  taskId: string
  runId: string
  toolCallId: string
  actionSummary: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
}

export interface ArtifactRow {
  id: string
  taskId: string
  runId: string
  agentId: string
  kind: string
  title: string
  fileName: string
  createdAt: string
}

export interface UsageRow {
  id: string
  agentId: string
  runId: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  latencyMs: number
  createdAt: string
}

export interface ActivityRow {
  id: number
  actor: 'user' | 'agent' | 'system'
  action: string
  entityRef: string
  detail: string
  createdAt: string
}

export interface TaskEventRow {
  id: number
  taskId: string
  eventType: string
  payload: string
  createdAt: string
}

// ── Phase 4: live meetings + notification center ────────────────────────────
export type MeetingStatus = 'running' | 'completed' | 'failed'

export interface MeetingRow {
  id: string
  topic: string
  participantIds: string[]
  rounds: number
  status: MeetingStatus
  artifactFile: string | null
  error: string | null
  createdAt: string
  endedAt: string | null
}

export interface MeetingMessageRow {
  id: string
  meetingId: string
  seq: number
  agentId: string
  /** 'speech' = a real model utterance; 'system' = an honest meeting record (e.g. a failed turn). */
  kind: 'speech' | 'system'
  content: string
  tokensIn: number
  tokensOut: number
  createdAt: string
}

export interface NotificationRow {
  id: string
  kind: 'task.completed' | 'task.failed' | 'approval.pending' | 'meeting.completed' | 'meeting.failed'
  title: string
  detail: string
  entityRef: string
  agentId: string | null
  isRead: boolean
  createdAt: string
}

export interface Repository {
  // agents
  listAgents(): AgentWithConfig[]
  getAgent(id: string): AgentWithConfig | null
  createAgent(a: AgentRow, c: AgentConfigRow): AgentWithConfig
  updateAgent(id: string, profile: Partial<AgentRow>, config: Partial<AgentConfigRow>): AgentWithConfig | null
  // tasks & runs
  createTask(t: TaskRow): TaskRow
  getTask(id: string): TaskRow | null
  listTasks(limit: number): TaskRow[]
  setTaskStatus(id: string, status: TaskStatus): void
  nextQueuedTask(): TaskRow | null
  createRun(r: RunRow): RunRow
  updateRun(id: string, patch: Partial<RunRow>): void
  getRun(id: string): RunRow | null
  listRuns(taskId: string): RunRow[]
  countRuns(taskId: string): number
  recoverInterruptedRuns(): number
  // tools & approvals
  addToolCall(t: ToolCallRow): void
  updateToolCall(id: string, patch: Partial<ToolCallRow>): void
  listToolCalls(runId: string): ToolCallRow[]
  createApproval(a: ApprovalRow): void
  getApproval(id: string): ApprovalRow | null
  decideApproval(id: string, decision: 'approved' | 'rejected'): ApprovalRow | null
  listApprovals(status?: string): ApprovalRow[]
  // artifacts, usage, logs
  addArtifact(a: ArtifactRow): void
  listArtifacts(taskId?: string): ArtifactRow[]
  addUsage(u: UsageRow): void
  usageToday(): { agentId: string; tokensIn: number; tokensOut: number; costUsd: number; calls: number }[]
  addActivity(actor: ActivityRow['actor'], action: string, entityRef: string, detail: string): void
  listActivity(limit: number): ActivityRow[]
  addTaskEvent(taskId: string, eventType: string, payload: unknown): void
  listTaskEvents(taskId: string): TaskEventRow[]
  // meetings (Phase 4)
  createMeeting(m: MeetingRow): MeetingRow
  getMeeting(id: string): MeetingRow | null
  listMeetings(limit: number): (MeetingRow & { messageCount: number })[]
  updateMeeting(id: string, patch: Partial<MeetingRow>): void
  addMeetingMessage(m: MeetingMessageRow): void
  listMeetingMessages(meetingId: string): MeetingMessageRow[]
  // notifications (Phase 4)
  addNotification(n: NotificationRow): void
  listNotifications(limit: number): NotificationRow[]
  unreadNotificationCount(): number
  markNotificationRead(id: string): void
  markAllNotificationsRead(): void
}

// Seed data lives in db/seed.ts (shared with the D1 repository); the
// names stay importable from here for compatibility.
import { SEED_AGENTS, DEFAULT_TOOLS } from './db/seed'
export { SEED_AGENTS, DEFAULT_TOOLS } from './db/seed'
const now = () => new Date().toISOString()

export class SqliteRepository implements Repository {
  private db: Database

  constructor(dbPath: string, private defaultModel: string) {
    mkdirSync(join(dbPath, '..'), { recursive: true })
    this.db = new Database(dbPath, { create: true })
    // Journal mode (Fase 7): WAL is preferred, but it needs shared-memory
    // mmap + fsync, which restricted sandboxes may block (opening then dies
    // with SQLITE_IOERR_SHMSIZE). This repository is a single in-process
    // connection, so the DELETE rollback journal loses nothing in practice —
    // fall back to it (with synchronous=OFF, the only mode that also works
    // where fsync is blocked) instead of refusing to start.
    try {
      this.db.exec('PRAGMA journal_mode = WAL;')
    } catch {
      this.db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = OFF;')
      console.warn('[db] WAL unavailable on this filesystem — fell back to DELETE journal (synchronous=OFF)')
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        shirt TEXT, pants TEXT, hair TEXT, skin TEXT, desk_index INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_configs (
        agent_id TEXT PRIMARY KEY REFERENCES agents(id), provider TEXT NOT NULL, model TEXT NOT NULL,
        temperature REAL NOT NULL DEFAULT 0.7, system_prompt TEXT NOT NULL DEFAULT '',
        allowed_tools TEXT NOT NULL DEFAULT '[]', workspace TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, instructions TEXT NOT NULL, agent_id TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, run_number INTEGER NOT NULL,
        provider TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL,
        started_at TEXT NOT NULL, ended_at TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_name TEXT NOT NULL, args_summary TEXT NOT NULL DEFAULT '',
        result_status TEXT NOT NULL, duration_ms INTEGER, requires_approval INTEGER NOT NULL DEFAULT 0,
        approval_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL,
        action_summary TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT);
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        kind TEXT NOT NULL, title TEXT NOT NULL, file_name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, run_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
        tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, cost_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
        entity_ref TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, event_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY, topic TEXT NOT NULL, participant_ids TEXT NOT NULL DEFAULT '[]',
        rounds INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL, artifact_file TEXT,
        error TEXT, created_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS meeting_messages (
        id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, seq INTEGER NOT NULL,
        agent_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'speech', content TEXT NOT NULL,
        tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
        entity_ref TEXT NOT NULL DEFAULT '', agent_id TEXT, is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_records(created_at);
      CREATE INDEX IF NOT EXISTS idx_meeting_messages ON meeting_messages(meeting_id, seq);
      CREATE INDEX IF NOT EXISTS idx_notifications ON notifications(is_read, created_at);
    `)
    this.seed()
  }

  private seed() {
    const count = this.db.query('SELECT COUNT(*) AS n FROM agents').get() as { n: number }
    if (count.n > 0) return
    const insA = this.db.prepare(
      'INSERT INTO agents (id, name, role, description, shirt, pants, hair, skin, desk_index, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
    )
    const insC = this.db.prepare(
      'INSERT INTO agent_configs (agent_id, provider, model, temperature, system_prompt, allowed_tools, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const a of SEED_AGENTS) {
      insA.run(a.id, a.name, a.role, a.description, a.shirt, a.pants, a.hair, a.skin, a.deskIndex, now(), now())
      insC.run(a.id, 'kenari', this.defaultModel, 0.7, a.prompt, JSON.stringify(DEFAULT_TOOLS), `agents/${a.id}`)
    }
  }

  // ── agents ────────────────────────────────────────────────────────────────
  private joinAgent(row: Record<string, unknown>): AgentWithConfig {
    const c = this.db.query('SELECT * FROM agent_configs WHERE agent_id = ?').get(row.id as string) as Record<string, unknown> | null
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

  listAgents(): AgentWithConfig[] {
    const rows = this.db.query('SELECT * FROM agents ORDER BY desk_index').all() as Record<string, unknown>[]
    return rows.map((r) => this.joinAgent(r))
  }

  getAgent(id: string): AgentWithConfig | null {
    const row = this.db.query('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown> | null
    return row ? this.joinAgent(row) : null
  }

  createAgent(a: AgentRow, c: AgentConfigRow): AgentWithConfig {
    this.db.prepare(
      'INSERT INTO agents (id, name, role, description, shirt, pants, hair, skin, desk_index, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(a.id, a.name, a.role, a.description, a.shirt, a.pants, a.hair, a.skin, a.deskIndex, a.isActive ? 1 : 0, a.createdAt, a.updatedAt)
    this.db.prepare(
      'INSERT INTO agent_configs (agent_id, provider, model, temperature, system_prompt, allowed_tools, workspace) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(c.agentId, c.provider, c.model, c.temperature, c.systemPrompt, JSON.stringify(c.allowedTools), c.workspace)
    return this.getAgent(a.id)!
  }

  updateAgent(id: string, p: Partial<AgentRow>, c: Partial<AgentConfigRow>): AgentWithConfig | null {
    const cur = this.getAgent(id)
    if (!cur) return null
    // Partial bodies carry explicit undefined for untouched fields — strip
    // them, or they would overwrite stored values with undefined.
    const clean = <T extends object>(o: T): Partial<T> =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
    const next: AgentWithConfig = {
      ...cur, ...clean(p), config: { ...cur.config, ...clean(c) },
    }
    this.db.prepare(
      'UPDATE agents SET name=?, role=?, description=?, is_active=?, updated_at=? WHERE id=?',
    ).run(next.name, next.role, next.description, next.isActive ? 1 : 0, now(), id)
    this.db.prepare(
      'UPDATE agent_configs SET provider=?, model=?, temperature=?, system_prompt=?, allowed_tools=?, workspace=? WHERE agent_id=?',
    ).run(next.config.provider, next.config.model, next.config.temperature, next.config.systemPrompt, JSON.stringify(next.config.allowedTools), next.config.workspace, id)
    return this.getAgent(id)
  }

  // ── tasks & runs ──────────────────────────────────────────────────────────
  createTask(t: TaskRow): TaskRow {
    this.db.prepare(
      'INSERT INTO tasks (id, title, instructions, agent_id, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(t.id, t.title, t.instructions, t.agentId, t.priority, t.status, t.createdAt, t.updatedAt)
    return t
  }

  private taskRow(r: Record<string, unknown>): TaskRow {
    return {
      id: r.id as string, title: r.title as string, instructions: r.instructions as string,
      agentId: r.agent_id as string, priority: r.priority as TaskRow['priority'],
      status: r.status as TaskStatus, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    }
  }

  getTask(id: string): TaskRow | null {
    const r = this.db.query('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | null
    return r ? this.taskRow(r) : null
  }

  listTasks(limit: number): TaskRow[] {
    const rows = this.db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[]
    return rows.map((r) => this.taskRow(r))
  }

  setTaskStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
  }

  nextQueuedTask(): TaskRow | null {
    const r = this.db.query(
      "SELECT * FROM tasks WHERE status = 'queued' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at ASC LIMIT 1",
    ).get() as Record<string, unknown> | null
    return r ? this.taskRow(r) : null
  }

  createRun(r: RunRow): RunRow {
    this.db.prepare(
      'INSERT INTO agent_runs (id, task_id, agent_id, run_number, provider, model, status, started_at, ended_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(r.id, r.taskId, r.agentId, r.runNumber, r.provider, r.model, r.status, r.startedAt, r.endedAt, r.error)
    return r
  }

  updateRun(id: string, patch: Partial<RunRow>): void {
    const cur = this.getRun(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.prepare(
      'UPDATE agent_runs SET status = ?, ended_at = ?, error = ? WHERE id = ?',
    ).run(n.status, n.endedAt, n.error, id)
  }

  private runRow(r: Record<string, unknown>): RunRow {
    return {
      id: r.id as string, taskId: r.task_id as string, agentId: r.agent_id as string,
      runNumber: r.run_number as number, provider: r.provider as string, model: r.model as string,
      status: r.status as RunStatus, startedAt: r.started_at as string,
      endedAt: (r.ended_at as string) ?? null, error: (r.error as string) ?? null,
    }
  }

  getRun(id: string): RunRow | null {
    const r = this.db.query('SELECT * FROM agent_runs WHERE id = ?').get(id) as Record<string, unknown> | null
    return r ? this.runRow(r) : null
  }

  listRuns(taskId: string): RunRow[] {
    const rows = this.db.query('SELECT * FROM agent_runs WHERE task_id = ? ORDER BY run_number ASC').all(taskId) as Record<string, unknown>[]
    return rows.map((r) => this.runRow(r))
  }

  countRuns(taskId: string): number {
    const r = this.db.query('SELECT COUNT(*) AS n FROM agent_runs WHERE task_id = ?').get(taskId) as { n: number }
    return r.n
  }

  recoverInterruptedRuns(): number {
    // A run left 'running'/'waiting_approval' at boot belonged to a dead
    // process. Mark it failed honestly — never resurrect it as completed.
    const res = this.db.prepare(
      "UPDATE agent_runs SET status = 'failed', ended_at = ?, error = 'Orchestrator restarted mid-run' WHERE status IN ('running', 'waiting_approval')",
    ).run(now())
    const res2 = this.db.prepare(
      "UPDATE tasks SET status = 'failed', updated_at = ? WHERE status IN ('running', 'waiting_approval')",
    ).run(now())
    this.db.prepare(
      "UPDATE approvals SET status = 'rejected', decided_at = ? WHERE status = 'pending'",
    ).run(now())
    // A meeting left 'running' belonged to the dead process too — its
    // transcript survives, but the meeting itself is honestly over.
    const res3 = this.db.prepare(
      "UPDATE meetings SET status = 'failed', ended_at = ?, error = 'Orchestrator restarted mid-meeting' WHERE status = 'running'",
    ).run(now())
    return res.changes + res2.changes + res3.changes
  }

  // ── tools & approvals ─────────────────────────────────────────────────────
  addToolCall(t: ToolCallRow): void {
    this.db.prepare(
      'INSERT INTO tool_calls (id, run_id, tool_name, args_summary, result_status, duration_ms, requires_approval, approval_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(t.id, t.runId, t.toolName, t.argsSummary, t.resultStatus, t.durationMs, t.requiresApproval ? 1 : 0, t.approvalId, t.createdAt)
  }

  updateToolCall(id: string, patch: Partial<ToolCallRow>): void {
    const cur = this.db.query('SELECT * FROM tool_calls WHERE id = ?').get(id) as Record<string, unknown> | null
    if (!cur) return
    this.db.prepare('UPDATE tool_calls SET result_status = ?, duration_ms = ? WHERE id = ?').run(
      patch.resultStatus ?? (cur.result_status as string),
      patch.durationMs ?? (cur.duration_ms as number | null),
      id,
    )
  }

  listToolCalls(runId: string): ToolCallRow[] {
    const rows = this.db.query('SELECT * FROM tool_calls WHERE run_id = ? ORDER BY created_at ASC').all(runId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, runId: r.run_id as string, toolName: r.tool_name as string,
      argsSummary: r.args_summary as string, resultStatus: r.result_status as string,
      durationMs: (r.duration_ms as number) ?? null, requiresApproval: (r.requires_approval as number) === 1,
      approvalId: (r.approval_id as string) ?? null, createdAt: r.created_at as string,
    }))
  }

  createApproval(a: ApprovalRow): void {
    this.db.prepare(
      'INSERT INTO approvals (id, task_id, run_id, tool_call_id, action_summary, status, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(a.id, a.taskId, a.runId, a.toolCallId, a.actionSummary, a.status, a.createdAt, a.decidedAt)
  }

  private approvalRow(r: Record<string, unknown>): ApprovalRow {
    return {
      id: r.id as string, taskId: r.task_id as string, runId: r.run_id as string,
      toolCallId: r.tool_call_id as string, actionSummary: r.action_summary as string,
      status: r.status as ApprovalRow['status'], createdAt: r.created_at as string,
      decidedAt: (r.decided_at as string) ?? null,
    }
  }

  getApproval(id: string): ApprovalRow | null {
    const r = this.db.query('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown> | null
    return r ? this.approvalRow(r) : null
  }

  decideApproval(id: string, decision: 'approved' | 'rejected'): ApprovalRow | null {
    const cur = this.getApproval(id)
    if (!cur || cur.status !== 'pending') return cur
    this.db.prepare('UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?').run(decision, now(), id)
    return this.getApproval(id)
  }

  listApprovals(status?: string): ApprovalRow[] {
    const rows = (status
      ? this.db.query('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC').all(status)
      : this.db.query('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 50').all()) as Record<string, unknown>[]
    return rows.map((r) => this.approvalRow(r))
  }

  // ── artifacts, usage, logs ────────────────────────────────────────────────
  addArtifact(a: ArtifactRow): void {
    this.db.prepare(
      'INSERT INTO artifacts (id, task_id, run_id, agent_id, kind, title, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(a.id, a.taskId, a.runId, a.agentId, a.kind, a.title, a.fileName, a.createdAt)
  }

  listArtifacts(taskId?: string): ArtifactRow[] {
    const rows = (taskId
      ? this.db.query('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC').all(taskId)
      : this.db.query('SELECT * FROM artifacts ORDER BY created_at DESC LIMIT 50').all()) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, taskId: r.task_id as string, runId: r.run_id as string, agentId: r.agent_id as string,
      kind: r.kind as string, title: r.title as string, fileName: r.file_name as string, createdAt: r.created_at as string,
    }))
  }

  addUsage(u: UsageRow): void {
    this.db.prepare(
      'INSERT INTO usage_records (id, agent_id, run_id, provider, model, tokens_in, tokens_out, cost_usd, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(u.id, u.agentId, u.runId, u.provider, u.model, u.tokensIn, u.tokensOut, u.costUsd, u.latencyMs, u.createdAt)
  }

  usageToday(): { agentId: string; tokensIn: number; tokensOut: number; costUsd: number; calls: number }[] {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const rows = this.db.query(
      'SELECT agent_id, SUM(tokens_in) AS ti, SUM(tokens_out) AS to_, SUM(cost_usd) AS c, COUNT(*) AS n FROM usage_records WHERE created_at >= ? GROUP BY agent_id',
    ).all(dayStart.toISOString()) as Record<string, unknown>[]
    return rows.map((r) => ({
      agentId: r.agent_id as string, tokensIn: r.ti as number, tokensOut: r.to_ as number,
      costUsd: r.c as number, calls: r.n as number,
    }))
  }

  addActivity(actor: ActivityRow['actor'], action: string, entityRef: string, detail: string): void {
    this.db.prepare(
      'INSERT INTO activity_logs (actor, action, entity_ref, detail, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(actor, action, entityRef, detail, now())
  }

  listActivity(limit: number): ActivityRow[] {
    const rows = this.db.query('SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?').all(limit) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number, actor: r.actor as ActivityRow['actor'], action: r.action as string,
      entityRef: r.entity_ref as string, detail: r.detail as string, createdAt: r.created_at as string,
    }))
  }

  addTaskEvent(taskId: string, eventType: string, payload: unknown): void {
    this.db.prepare(
      'INSERT INTO task_events (task_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)',
    ).run(taskId, eventType, JSON.stringify(payload ?? {}), now())
  }

  listTaskEvents(taskId: string): TaskEventRow[] {
    const rows = this.db.query('SELECT * FROM task_events WHERE task_id = ? ORDER BY id ASC').all(taskId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as number, taskId: r.task_id as string, eventType: r.event_type as string,
      payload: r.payload as string, createdAt: r.created_at as string,
    }))
  }

  // ── meetings (Phase 4) ────────────────────────────────────────────────────
  private meetingRow(r: Record<string, unknown>): MeetingRow {
    return {
      id: r.id as string, topic: r.topic as string,
      participantIds: JSON.parse((r.participant_ids as string) ?? '[]') as string[],
      rounds: r.rounds as number, status: r.status as MeetingStatus,
      artifactFile: (r.artifact_file as string) ?? null, error: (r.error as string) ?? null,
      createdAt: r.created_at as string, endedAt: (r.ended_at as string) ?? null,
    }
  }

  createMeeting(m: MeetingRow): MeetingRow {
    this.db.prepare(
      'INSERT INTO meetings (id, topic, participant_ids, rounds, status, artifact_file, error, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(m.id, m.topic, JSON.stringify(m.participantIds), m.rounds, m.status, m.artifactFile, m.error, m.createdAt, m.endedAt)
    return m
  }

  getMeeting(id: string): MeetingRow | null {
    const r = this.db.query('SELECT * FROM meetings WHERE id = ?').get(id) as Record<string, unknown> | null
    return r ? this.meetingRow(r) : null
  }

  listMeetings(limit: number): (MeetingRow & { messageCount: number })[] {
    const rows = this.db.query(
      'SELECT m.*, (SELECT COUNT(*) FROM meeting_messages mm WHERE mm.meeting_id = m.id) AS mc FROM meetings m ORDER BY m.created_at DESC LIMIT ?',
    ).all(limit) as Record<string, unknown>[]
    return rows.map((r) => ({ ...this.meetingRow(r), messageCount: r.mc as number }))
  }

  updateMeeting(id: string, patch: Partial<MeetingRow>): void {
    const cur = this.getMeeting(id)
    if (!cur) return
    const n = { ...cur, ...patch }
    this.db.prepare(
      'UPDATE meetings SET status = ?, artifact_file = ?, error = ?, ended_at = ? WHERE id = ?',
    ).run(n.status, n.artifactFile, n.error, n.endedAt, id)
  }

  addMeetingMessage(m: MeetingMessageRow): void {
    this.db.prepare(
      'INSERT INTO meeting_messages (id, meeting_id, seq, agent_id, kind, content, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(m.id, m.meetingId, m.seq, m.agentId, m.kind, m.content, m.tokensIn, m.tokensOut, m.createdAt)
  }

  listMeetingMessages(meetingId: string): MeetingMessageRow[] {
    const rows = this.db.query('SELECT * FROM meeting_messages WHERE meeting_id = ? ORDER BY seq ASC').all(meetingId) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, meetingId: r.meeting_id as string, seq: r.seq as number,
      agentId: r.agent_id as string, kind: r.kind as MeetingMessageRow['kind'],
      content: r.content as string, tokensIn: r.tokens_in as number,
      tokensOut: r.tokens_out as number, createdAt: r.created_at as string,
    }))
  }

  // ── notifications (Phase 4) ───────────────────────────────────────────────
  addNotification(n: NotificationRow): void {
    this.db.prepare(
      'INSERT INTO notifications (id, kind, title, detail, entity_ref, agent_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(n.id, n.kind, n.title, n.detail, n.entityRef, n.agentId, n.isRead ? 1 : 0, n.createdAt)
  }

  listNotifications(limit: number): NotificationRow[] {
    const rows = this.db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?').all(limit) as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string, kind: r.kind as NotificationRow['kind'], title: r.title as string,
      detail: r.detail as string, entityRef: r.entity_ref as string,
      agentId: (r.agent_id as string) ?? null, isRead: (r.is_read as number) === 1,
      createdAt: r.created_at as string,
    }))
  }

  unreadNotificationCount(): number {
    const r = this.db.query('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0').get() as { n: number }
    return r.n
  }

  markNotificationRead(id: string): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id)
  }

  markAllNotificationsRead(): void {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run()
  }
}
