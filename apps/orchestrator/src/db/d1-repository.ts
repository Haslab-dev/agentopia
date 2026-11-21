import type { Repository } from '../db'

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION REQUIRED — Cloudflare D1 repository (ARCHITECTURE.md §1.1, §4).
//
// Lutfi's decision (2026-11-21): the cloud target is the Cloudflare Stack,
// not Supabase. The D1 schema is written and versioned in
// cloudflare/d1/migrations/ at the repo root, derived 1:1 from the SQLite
// schema that runs locally — D1 speaks the same dialect, so no translation
// layer is needed. What is missing is not code shape: D1 is reachable ONLY
// from the Cloudflare Worker runtime (the `env.DB` binding), and the
// orchestrator has not been ported to a Worker yet. No D1 database has
// been created. Until that port exists, every method throws — loudly, at
// first use — instead of silently falling back to local data. The running
// engine uses SqliteRepository (src/db.ts) behind the same interface.
// Activation plan: cloudflare/README.md.
// ─────────────────────────────────────────────────────────────────────────────

const MSG =
  'Integration Required: D1 repository is not wired. D1 is reachable only from the Cloudflare Worker ' +
  'runtime (env.DB binding) and no D1 database exists yet. Port the orchestrator to a Worker, create the ' +
  'database and apply cloudflare/d1/migrations/ first — see cloudflare/README.md.'

export class D1Repository implements Repository {
  constructor() {
    throw new Error(MSG)
  }
  // The constructor throws, so these are unreachable; they exist so the
  // class structurally satisfies the interface if the throw is ever removed.
  listAgents(): never { throw new Error(MSG) }
  getAgent(): never { throw new Error(MSG) }
  createAgent(): never { throw new Error(MSG) }
  updateAgent(): never { throw new Error(MSG) }
  createTask(): never { throw new Error(MSG) }
  getTask(): never { throw new Error(MSG) }
  listTasks(): never { throw new Error(MSG) }
  setTaskStatus(): never { throw new Error(MSG) }
  nextQueuedTask(): never { throw new Error(MSG) }
  createRun(): never { throw new Error(MSG) }
  updateRun(): never { throw new Error(MSG) }
  getRun(): never { throw new Error(MSG) }
  listRuns(): never { throw new Error(MSG) }
  countRuns(): never { throw new Error(MSG) }
  recoverInterruptedRuns(): never { throw new Error(MSG) }
  addToolCall(): never { throw new Error(MSG) }
  updateToolCall(): never { throw new Error(MSG) }
  listToolCalls(): never { throw new Error(MSG) }
  createApproval(): never { throw new Error(MSG) }
  getApproval(): never { throw new Error(MSG) }
  decideApproval(): never { throw new Error(MSG) }
  listApprovals(): never { throw new Error(MSG) }
  addArtifact(): never { throw new Error(MSG) }
  listArtifacts(): never { throw new Error(MSG) }
  addUsage(): never { throw new Error(MSG) }
  usageToday(): never { throw new Error(MSG) }
  addActivity(): never { throw new Error(MSG) }
  listActivity(): never { throw new Error(MSG) }
  addTaskEvent(): never { throw new Error(MSG) }
  listTaskEvents(): never { throw new Error(MSG) }
  createMeeting(): never { throw new Error(MSG) }
  getMeeting(): never { throw new Error(MSG) }
  listMeetings(): never { throw new Error(MSG) }
  updateMeeting(): never { throw new Error(MSG) }
  addMeetingMessage(): never { throw new Error(MSG) }
  listMeetingMessages(): never { throw new Error(MSG) }
  addNotification(): never { throw new Error(MSG) }
  listNotifications(): never { throw new Error(MSG) }
  unreadNotificationCount(): never { throw new Error(MSG) }
  markNotificationRead(): never { throw new Error(MSG) }
  markAllNotificationsRead(): never { throw new Error(MSG) }
}
