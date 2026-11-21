import type { WorkEventType } from '@living-world/shared-types'
import { emitWorkEvent } from './eventBus'
import { pushLog, useWorldStore } from '../state/stores'
import { demoDriver } from './DemoDriver'
import { ORCHESTRATOR_URL, getAuthToken, useMeetingLiveStore, useServerStore } from './ServerApi'

export { ORCHESTRATOR_URL }

// ─────────────────────────────────────────────────────────────────────────────
// LiveClient — the §7 contract proof client. Connects to the minimal
// orchestrator (apps/orchestrator) over SSE and re-emits its events onto the
// SAME frozen event bus the DemoDriver uses, stamped source:'live'. This is
// the swap the §7 bet is about: world/ and simulation/ cannot tell (and do
// not care) which source produced an event.
//
// Phase 3: the orchestrator behind this stream is now a real task engine
// (SQLite-backed agents/tasks/runs — see ServerApi.ts). In the cloud
// deployment the same engine runs in a Worker on D1 and the stream is
// guarded by JWT login (EventSource cannot set headers, so the token
// rides as a ?token= query parameter — the Worker accepts it there).
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveConnection {
  ok: boolean
  reason: string
}

let es: EventSource | null = null
let connected = false

export function liveConnected(): boolean {
  return connected
}

interface IncomingEvent {
  type: WorkEventType | 'hello' | 'control'
  kind?: string
  meetingId?: string
  agentId?: string
  taskId?: string
  text?: string
  payload?: Record<string, string | number | boolean>
}

const seenMeetings = new Set<string>()

export function connectLive(): LiveConnection {
  if (es) {
    return {
      ok: connected,
      reason: connected
        ? 'Live orchestrator connected (SSE). Demo mode still runs in parallel and stays labelled DEMO.'
        : 'Live orchestrator connection is opening… if it stays offline, start it with: python3 apps/orchestrator/run.py',
    }
  }
  if (typeof EventSource === 'undefined') {
    return { ok: false, reason: 'EventSource is not available in this browser.' }
  }
  try {
    const token = getAuthToken()
    es = new EventSource(token ? `${ORCHESTRATOR_URL}/events?token=${encodeURIComponent(token)}` : `${ORCHESTRATOR_URL}/events`)
  } catch (err) {
    return { ok: false, reason: `Could not open live event stream: ${String(err)}` }
  }
  es.onopen = () => {
    connected = true
    useServerStore.getState().setStreamConnected(true)
    void useServerStore.getState().refresh()
    pushLog('LIVE channel connected — orchestrator event stream open (Kenari).', 'event')
  }
  es.onerror = () => {
    connected = false
    useServerStore.getState().setStreamConnected(false)
  }
  es.onmessage = (msg) => {
    let e: IncomingEvent
    try {
      e = JSON.parse(msg.data as string) as IncomingEvent
    } catch {
      return
    }
    if ((e.type as string) === 'control') {
      // Phase 4 meeting stream frames update the live mirror directly —
      // they arrive per token delta, far too often for a REST refresh.
      const live = useMeetingLiveStore.getState()
      if (e.kind === 'meeting-turn' && e.meetingId && e.agentId) {
        live.setTurn(e.meetingId, e.agentId)
        return
      }
      if (e.kind === 'meeting-delta' && e.meetingId && e.agentId) {
        live.setPartial(e.meetingId, e.agentId, e.text ?? '')
        return
      }
      if (e.kind === 'meeting-turn-end') {
        live.endTurn()
        return
      }
      if (e.kind === 'meeting-ended') live.clear()
      // Approvals, notifications, persisted meeting messages — refresh truth.
      void useServerStore.getState().refresh()
      return
    }
    if (e.type === 'hello' || !e.agentId) return
    const type = e.type as WorkEventType

    if (type === 'task.collaboration' && e.payload?.meetingId) {
      const mid = String(e.payload.meetingId)
      if (!seenMeetings.has(mid)) {
        seenMeetings.add(mid)
        pushLog(`[live] Meeting started: "${String(e.payload.topic ?? '')}" — participants heading to the meeting room`, 'event')
      }
    }
    if (type === 'meeting.speaking') {
      // Speaker highlight only — the orchestrator re-emits this while a
      // turn is in flight, so logging it would flood the session log.
      emitWorkEvent({
        type, agentId: e.agentId, taskId: e.taskId,
        simMinutes: useWorldStore.getState().simMinutes, source: 'live', payload: e.payload,
      })
      return
    }

    // Register BEFORE emitting: the simulation engine reports desk arrival
    // to the DemoDriver for every task, and the demo script must not fire
    // for a task the orchestrator owns.
    if (type === 'task.assigned' && e.taskId) {
      demoDriver.markLiveTask(e.taskId)
      useWorldStore.getState().upsertTask({
        id: e.taskId,
        title: String(e.payload?.title ?? 'Live task (Kenari)'),
        agentId: e.agentId,
        status: 'assigned',
        isDemo: false,
        createdAt: Date.now(),
      })
      pushLog(`[live] Task assigned → ${e.agentId} (real run starting via Kenari)`, 'task')
    }
    if (type === 'task.completed' && e.payload?.meetingId) {
      pushLog(`[live] Meeting selesai: "${String(e.payload.topic ?? '')}" — notulen: ${String(e.payload.artifact ?? '—')}`, 'done')
      void useServerStore.getState().refresh()
    } else if (type === 'task.completed') {
      pushLog(`[live] Task completed by ${e.agentId} — real LLM work, artifact: ${String(e.payload?.artifact ?? '—')}`, 'done')
      void useServerStore.getState().refresh()
    }
    if (type === 'run.waiting_input') {
      pushLog(`[live] ${e.agentId} is waiting for an approval decision — see the Tasks panel.`, 'warn')
      void useServerStore.getState().refresh()
    }
    if (type === 'task.failed') {
      pushLog(`[live] Task FAILED for ${e.agentId}: ${String(e.payload?.error ?? 'unknown error')}`, 'warn')
    }

    emitWorkEvent({
      type,
      agentId: e.agentId,
      taskId: e.taskId,
      simMinutes: useWorldStore.getState().simMinutes,
      source: 'live',
      payload: e.payload,
    })
  }
  return {
    ok: false,
    reason:
      'Live channel opening — the orchestrator (apps/orchestrator, Kenari) streams real events here. ' +
      'The cloud deployment asks for a JWT login before the stream opens.',
  }
}

/** Close the stream (logout / before reconnecting with a fresh token). */
export function disconnectLive() {
  if (es) {
    es.close()
    es = null
  }
  connected = false
  useServerStore.getState().setStreamConnected(false)
}

/** Trigger the one real proof task on the orchestrator. */
export async function runLiveProof(): Promise<{ ok: boolean; message: string }> {
  try {
    const token = getAuthToken()
    const res = await fetch(`${ORCHESTRATOR_URL}/run-live-proof`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) {
      return { ok: false, message: json.error ?? `Orchestrator returned HTTP ${res.status}` }
    }
    return { ok: true, message: 'Live proof started — watch Gilang (Copywriter): the events now arriving are real.' }
  } catch {
    return {
      ok: false,
      message: 'Orchestrator unreachable. Start it first: python3 apps/orchestrator/run.py',
    }
  }
}

/** Fetch an artifact's real content from the orchestrator (never fabricated in the UI). */
export async function fetchArtifact(name: string): Promise<string> {
  const token = getAuthToken()
  const res = await fetch(`${ORCHESTRATOR_URL}/artifact?name=${encodeURIComponent(name)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Artifact fetch failed: HTTP ${res.status}`)
  return res.text()
}
