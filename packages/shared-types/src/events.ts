// ─────────────────────────────────────────────────────────────────────────────
// FROZEN EVENT CONTRACT (ARCHITECTURE.md §1.3 + §7) — do not change shape
// without a contract revision. Every work-status change in the system is one
// of these events, whether the source is the Phase 1 DemoDriver or the future
// live orchestrator. world/ and simulation/ consume ONLY this format.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkEventType =
  | 'task.assigned'        // → agent walks to assigned desk
  | 'task.started'         // → agent sits, typing animation
  | 'run.thinking'         // → thinking animation / indicator
  | 'tool.started'         // → computer-interaction animation
  | 'tool.finished'        // → back to typing / idle-at-desk
  | 'run.waiting_input'    // → waiting idle + "?" badge
  | 'task.collaboration'   // → participants walk to meeting room, sit
  | 'meeting.speaking'     // → talking animation on the active speaker
  | 'task.completed'       // → celebrate + notification
  | 'task.failed'          // → error indicator + log entry
  | 'agent.offline'        // → agent returns to rest spot

export interface WorkEvent {
  /** Monotonic sequence number assigned by the event store. */
  seq: number
  type: WorkEventType
  agentId: string
  taskId?: string
  /** Virtual-clock minutes when the event was emitted. */
  simMinutes: number
  /** Who produced this event. 'demo' = scripted DemoDriver, never real work. */
  source: 'demo' | 'live'
  payload?: Record<string, string | number | boolean>
}

export type WorkEventInput = Omit<WorkEvent, 'seq'>
