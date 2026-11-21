import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────────────────
// ServerApi — REST client + mirror store for the Phase 3 orchestrator.
// The UI reads server truth (agents, tasks, runs, approvals, usage,
// activity) from here when the orchestrator is reachable. When it is not,
// `online` stays false and panels must say so honestly and fall back to
// clearly-labelled demo data — never silently pretend server data exists.
// ─────────────────────────────────────────────────────────────────────────────

export const ORCHESTRATOR_URL = 'http://localhost:8787'

export interface ServerAgentConfig {
  agentId: string
  provider: string
  model: string
  temperature: number
  systemPrompt: string
  allowedTools: string[]
  workspace: string
}

export interface ServerAgent {
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
  config: ServerAgentConfig
  usageToday: { tokensIn: number; tokensOut: number; costUsd: number; calls: number }
}

export interface ServerRun {
  id: string
  taskId: string
  agentId: string
  runNumber: number
  provider: string
  model: string
  status: 'running' | 'waiting_approval' | 'completed' | 'failed'
  startedAt: string
  endedAt: string | null
  error: string | null
  toolCalls?: ServerToolCall[]
}

export interface ServerToolCall {
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

export interface ServerArtifact {
  id: string
  taskId: string
  runId: string
  agentId: string
  kind: string
  title: string
  fileName: string
  createdAt: string
}

export interface ServerTask {
  id: string
  title: string
  instructions: string
  agentId: string
  priority: 'low' | 'normal' | 'high'
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  updatedAt: string
  runs: ServerRun[]
  artifacts: ServerArtifact[]
}

export interface ServerApproval {
  id: string
  taskId: string
  runId: string
  toolCallId: string
  actionSummary: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
}

export interface ServerActivity {
  id: number
  actor: 'user' | 'agent' | 'system'
  action: string
  entityRef: string
  detail: string
  createdAt: string
}

// ── Phase 4: meetings + notifications ────────────────────────────────────────
export interface ServerMeeting {
  id: string
  topic: string
  participantIds: string[]
  rounds: number
  status: 'running' | 'completed' | 'failed'
  artifactFile: string | null
  error: string | null
  createdAt: string
  endedAt: string | null
  messageCount: number
}

export interface ServerMeetingMessage {
  id: string
  meetingId: string
  seq: number
  agentId: string
  kind: 'speech' | 'system'
  content: string
  tokensIn: number
  tokensOut: number
  createdAt: string
}

export interface ServerNotification {
  id: string
  kind: 'task.completed' | 'task.failed' | 'approval.pending' | 'meeting.completed' | 'meeting.failed'
  title: string
  detail: string
  entityRef: string
  agentId: string | null
  isRead: boolean
  createdAt: string
}

interface ServerStore {
  online: boolean
  streamConnected: boolean
  agents: ServerAgent[]
  tasks: ServerTask[]
  approvals: ServerApproval[]
  activity: ServerActivity[]
  meetings: ServerMeeting[]
  meetingRunning: boolean
  notifications: ServerNotification[]
  unreadNotifications: number
  usageTotal: { tokensIn: number; tokensOut: number; costUsd: number; calls: number } | null
  pricingNote: string
  setStreamConnected: (b: boolean) => void
  refresh: () => Promise<void>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

async function send<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
  if (!res.ok || (json as { ok?: boolean }).ok === false) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return json
}

export const useServerStore = create<ServerStore>((set) => ({
  online: false,
  streamConnected: false,
  agents: [],
  tasks: [],
  approvals: [],
  activity: [],
  meetings: [],
  meetingRunning: false,
  notifications: [],
  unreadNotifications: 0,
  usageTotal: null,
  pricingNote: '',
  setStreamConnected: (streamConnected) => set({ streamConnected }),
  refresh: async () => {
    try {
      const [agents, tasks, approvals, activity, usage, meetings, notifications] = await Promise.all([
        get<{ agents: ServerAgent[] }>('/agents'),
        get<{ tasks: ServerTask[] }>('/tasks'),
        get<{ approvals: ServerApproval[] }>('/approvals?status=pending'),
        get<{ activity: ServerActivity[] }>('/activity?limit=40'),
        get<{ total: ServerStore['usageTotal']; pricingNote: string }>('/usage'),
        get<{ meetings: ServerMeeting[]; running: boolean }>('/meetings'),
        get<{ notifications: ServerNotification[]; unread: number }>('/notifications?limit=50'),
      ])
      set({
        online: true,
        agents: agents.agents,
        tasks: tasks.tasks,
        approvals: approvals.approvals,
        activity: activity.activity,
        meetings: meetings.meetings,
        meetingRunning: meetings.running,
        notifications: notifications.notifications,
        unreadNotifications: notifications.unread,
        usageTotal: usage.total,
        pricingNote: usage.pricingNote,
      })
    } catch {
      set({ online: false })
    }
  },
}))

// ── Live meeting stream state (Phase 4) ──────────────────────────────────────
// Fed by SSE control frames from the orchestrator while a meeting runs:
// who is speaking right now, and that speaker's reply text AS IT STREAMS
// from the model (real partial output — replaced by the persisted message
// when the turn completes). Not server truth; a live mirror only.
interface MeetingLiveStore {
  meetingId: string | null
  speakerId: string | null
  partialText: string
  setTurn: (meetingId: string, agentId: string) => void
  setPartial: (meetingId: string, agentId: string, text: string) => void
  endTurn: () => void
  clear: () => void
}

export const useMeetingLiveStore = create<MeetingLiveStore>((set) => ({
  meetingId: null,
  speakerId: null,
  partialText: '',
  setTurn: (meetingId, agentId) => set({ meetingId, speakerId: agentId, partialText: '' }),
  setPartial: (meetingId, agentId, text) =>
    set((s) => (s.meetingId === meetingId && s.speakerId === agentId ? { partialText: text } : s)),
  endTurn: () => set({ speakerId: null, partialText: '' }),
  clear: () => set({ meetingId: null, speakerId: null, partialText: '' }),
}))

let syncStarted = false
export function startServerSync() {
  if (syncStarted) return
  syncStarted = true
  void useServerStore.getState().refresh()
  setInterval(() => void useServerStore.getState().refresh(), 4000)
}

// ── Commands (used by panels) ────────────────────────────────────────────────
export async function createLiveTask(input: { title: string; instructions: string; agentId: string; priority: string }) {
  const r = await send<{ task: ServerTask }>('/tasks', 'POST', input)
  void useServerStore.getState().refresh()
  return r.task
}

export async function retryLiveTask(taskId: string) {
  await send(`/tasks/${taskId}/retry`, 'POST', {})
  void useServerStore.getState().refresh()
}

export async function decideApproval(approvalId: string, decision: 'approved' | 'rejected') {
  await send(`/approvals/${approvalId}/decide`, 'POST', { decision })
  void useServerStore.getState().refresh()
}

export async function updateServerAgent(id: string, patch: { isActive?: boolean; config: Partial<ServerAgentConfig> }) {
  const r = await send<{ agent: ServerAgent }>(`/agents/${id}`, 'PATCH', patch)
  void useServerStore.getState().refresh()
  return r.agent
}

export async function createServerAgent(input: { name: string; role: string }) {
  const r = await send<{ agent: ServerAgent }>('/agents', 'POST', input)
  void useServerStore.getState().refresh()
  return r.agent
}

export async function fetchTaskDetail(taskId: string) {
  return get<{ task: ServerTask; runs: ServerRun[]; artifacts: ServerArtifact[] }>(`/tasks/${taskId}`)
}

// ── Phase 4 commands ─────────────────────────────────────────────────────────
export async function createMeeting(input: { topic: string; participantIds: string[]; rounds: number }) {
  const r = await send<{ meeting: ServerMeeting }>('/meetings', 'POST', input)
  void useServerStore.getState().refresh()
  return r.meeting
}

export async function fetchMeetingDetail(meetingId: string) {
  return get<{ meeting: ServerMeeting; messages: ServerMeetingMessage[] }>(`/meetings/${meetingId}`)
}

export async function markNotificationRead(id: string) {
  await send(`/notifications/${id}/read`, 'POST', {})
  void useServerStore.getState().refresh()
}

export async function markAllNotificationsRead() {
  await send('/notifications/read-all', 'POST', {})
  void useServerStore.getState().refresh()
}
