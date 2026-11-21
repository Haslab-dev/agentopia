import type { Repository } from '../db'

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION REQUIRED — Supabase repository (ARCHITECTURE.md §1.1, §4).
//
// The SQL schema for this implementation is written and versioned in
// supabase/migrations/ at the repo root. What is missing is not code shape
// but Lutfi's own Supabase project: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// (server-side only) and a decision on the Auth/RLS policies to enable.
// Until that project exists, every method throws — loudly, at first use —
// instead of silently falling back to local data. The running Phase 3
// engine uses SqliteRepository (src/db.ts) behind the same interface.
// ─────────────────────────────────────────────────────────────────────────────

const MSG =
  'Integration Required: Supabase repository is not connected. Create a Supabase project (Lutfi), ' +
  'apply supabase/migrations/, and set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for the orchestrator.'

export class SupabaseRepository implements Repository {
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
