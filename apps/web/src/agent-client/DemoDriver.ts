import type { Task } from '@living-world/shared-types'
import { emitWorkEvent } from './eventBus'
import { useWorldStore, pushLog } from '../state/stores'

// ─────────────────────────────────────────────────────────────────────────────
// DemoDriver — Phase 1's event source. In the live architecture this role
// sits in the orchestrator (ARCHITECTURE.md §1.4); here it is a local
// scripted driver that emits events in the EXACT frozen format of §1.3.
// Everything it produces is labelled source:'demo'. It simulates a work
// lifecycle — it does NOT run any LLM and must never be presented as real
// work. Swapping to live mode = replacing this driver with the WS client in
// LiveClient.ts; world/ and simulation/ stay untouched (the §7 bet).
// ─────────────────────────────────────────────────────────────────────────────

const MEETING_CREW = ['manager', 'ceo', 'designer', 'research']

class DemoDriver {
  private timers: ReturnType<typeof setTimeout>[] = []
  private clockTimer: ReturnType<typeof setInterval> | null = null
  private meetingDay = -1
  /** Registered by simulation/: called when an agent physically reaches its desk. */
  onArrivedAtDesk: ((agentId: string, taskId: string) => void) | null = null
  /** Task ids owned by the live orchestrator. The simulation engine calls
      notifyArrivedAtDesk for every task.assigned (it cannot tell sources
      apart), so the demo script must stay silent for live tasks — their
      lifecycle is driven by the orchestrator's real event stream. */
  private liveTaskIds = new Set<string>()

  markLiveTask(taskId: string) {
    this.liveTaskIds.add(taskId)
  }

  start() {
    if (this.clockTimer) return
    pushLog('DEMO driver active — all work events are scripted simulations, no LLM is connected.', 'warn')
    this.clockTimer = setInterval(() => this.watchClock(), 600)
  }

  stop() {
    if (this.clockTimer) clearInterval(this.clockTimer)
    this.timers.forEach(clearTimeout)
    this.timers = []
    this.clockTimer = null
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms))
  }

  private emit(type: Parameters<typeof emitWorkEvent>[0]['type'], agentId: string, taskId?: string, payload?: Record<string, string | number | boolean>) {
    emitWorkEvent({
      type,
      agentId,
      taskId,
      simMinutes: useWorldStore.getState().simMinutes,
      source: 'demo',
      payload,
    })
  }

  /** Entry point used by the Tasks UI. Emits the frozen lifecycle script. */
  assignTask(task: Task) {
    if (!task.agentId) return
    const agentId = task.agentId
    this.emit('task.assigned', agentId, task.id, { title: task.title })
    pushLog(`[demo] Task "${task.title}" assigned → ${agentId}`, 'task')
    // The rest of the lifecycle starts when simulation reports the agent has
    // physically arrived at the desk (see notifyArrivedAtDesk), so the
    // animation and the event stream stay in sync.
  }

  /** Called by simulation/ through the registered hook. */
  notifyArrivedAtDesk(agentId: string, taskId: string) {
    if (this.liveTaskIds.has(taskId)) return // live task — orchestrator drives it
    const speed = 1 // script pacing is wall-clock; sim speed affects movement only
    void speed
    this.later(400, () => this.emit('task.started', agentId, taskId))
    this.later(1600, () => this.emit('run.thinking', agentId, taskId))
    this.later(3200, () => this.emit('tool.started', agentId, taskId, { tool: 'demo-tool' }))
    this.later(5200, () => this.emit('tool.finished', agentId, taskId, { tool: 'demo-tool' }))
    this.later(7000, () => {
      this.emit('task.completed', agentId, taskId)
      pushLog(`[demo] Task completed by ${agentId} (scripted — no real work was performed)`, 'done')
    })
  }

  /** Scripted daily meeting at 14:00 virtual time. */
  private watchClock() {
    const { simMinutes } = useWorldStore.getState()
    const day = Math.floor(simMinutes / (24 * 60))
    const mins = simMinutes % (24 * 60)
    if (mins >= 14 * 60 && mins < 14 * 60 + 30 && this.meetingDay !== day) {
      this.meetingDay = day
      this.startMeeting()
    }
  }

  private startMeeting() {
    pushLog('[demo] Scheduled meeting started (scripted collaboration event)', 'event')
    MEETING_CREW.forEach((agentId, i) => {
      this.emit('task.collaboration', agentId, undefined, { seatIndex: i, topic: 'Daily sync (demo)' })
    })
    // Rotate the speaker a few times, then stop emitting; simulation expires
    // the meeting intent on its own clock.
    let round = 0
    const speak = () => {
      if (round >= 6) return
      const speaker = MEETING_CREW[round % MEETING_CREW.length]
      this.emit('meeting.speaking', speaker, undefined, { topic: 'Daily sync (demo)' })
      round++
      this.later(2600, speak)
    }
    this.later(3000, speak)
  }
}

export const demoDriver = new DemoDriver()
