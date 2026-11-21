import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────────────────────
// ServerApi — REST client + mirror store for the Phase 3 orchestrator.
// The UI reads server truth (agents, tasks, runs, approvals, usage,
// activity) from here when the orchestrator is reachable. When it is not,
// `online` stays false and panels must say so honestly and fall back to
// clearly-labelled demo data — never silently pretend server data exists.
// ─────────────────────────────────────────────────────────────────────────────

// Baked at build time (Vite env). Local dev falls back to the Bun
// orchestrator on localhost; the cloud build sets
// VITE_ORCHESTRATOR_URL=https://agentopia-orchestrator.hasdev.workers.dev.
export const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL ?? 'http://localhost:8787'

// ── Cloud auth (JWT) ─────────────────────────────────────────────────────────
// The cloud Worker requires a Bearer JWT on every endpoint except
// /health (see apps/orchestrator/src/auth.ts). The token is obtained from
// POST /auth/login and kept in localStorage. The local orchestrator has
// no auth — when no token is stored, no header is sent and nothing
// changes locally. A 401 from the API raises `authRequired` in the store
// and the LoginGate (ui/LoginGate.tsx) takes over.
const TOKEN_KEY = 'agentopia-auth-token'

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
  /** True when the API demands a login (cloud JWT) and we have no valid token. */
  authRequired: boolean
  /** The stored JWT, mirrored in state so the UI can show a logout control. */
  authToken: string | null
  setAuthRequired: (b: boolean) => void
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
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
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, { headers: { ...authHeaders() } })
  if (res.status === 401) {
    useServerStore.getState().setAuthRequired(true)
    throw new Error('HTTP 401')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

async function send<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(`${ORCHESTRATOR_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    useServerStore.getState().setAuthRequired(true)
    throw new Error('Unauthorized — login required')
  }
  const json = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string }
  if (!res.ok || (json as { ok?: boolean }).ok === false) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return json
}

export const useServerStore = create<ServerStore>((set, getState) => ({
  online: false,
  streamConnected: false,
  authRequired: false,
  authToken: getAuthToken(),
  setAuthRequired: (authRequired) => set({ authRequired }),
  login: async (username, password) => {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; error?: string }
      if (!res.ok || !body.ok || !body.token) {
        return { ok: false, error: body.error ?? `Login gagal (HTTP ${res.status})` }
      }
      try {
        window.localStorage.setItem(TOKEN_KEY, body.token)
      } catch {
        /* storage unavailable — the token still lives in store state */
      }
      set({ authToken: body.token, authRequired: false })
      void getState().refresh()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Orchestrator tidak terjangkau.' }
    }
  },
  logout: () => {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
    set({ authToken: null, authRequired: true, online: false })
  },
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
