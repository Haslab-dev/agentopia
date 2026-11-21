export type AgentStatus =
  | 'idle'
  | 'walking'
  | 'thinking'
  | 'working'
  | 'meeting'
  | 'leisure'
  | 'celebrating'
  | 'error'
  | 'paused'

export interface AgentDef {
  id: string
  name: string
  role: string
  /** Display metadata only until a live provider is connected (Phase 3). */
  modelLabel: string
  shirt: string
  pants: string
  hair: string
  skin: string
  /** Index into the desk anchors; negative = special anchor (CEO office, meeting). */
  deskIndex: number
}

export interface AgentState extends AgentDef {
  status: AgentStatus
  activity: string
  currentTaskId: string | null
  currentRoomId: string
  tasksDone: number
  paused: boolean
}

export type TaskStatus =
  | 'queued' | 'assigned' | 'working' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  agentId: string | null
  status: TaskStatus
  /** Demo tasks are scripted simulations — never real LLM work.
      Live tasks (isDemo: false) come from the orchestrator's event stream. */
  isDemo: boolean
  createdAt: number
}

export interface LogEntry {
  id: number
  time: string
  text: string
  kind: 'info' | 'task' | 'done' | 'warn' | 'event'
}
