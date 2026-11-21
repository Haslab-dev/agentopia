import type { WorkEvent } from '@living-world/shared-types'
import {
  anchor, aptRoomIndexAt, CAFE, CEO_DESK, DESKS, FIELD, FLOOR_H, homeAnchor,
  insideApartment, insideHQ, insideResearch, LOUNGE_SPOTS, MEETING_SEATS,
  outdoorAnchor, PLAZA, POOL_EDGE, RES_DESKS, route,
  type Anchor, type PathPt, type Vec2,
} from '../world/layout'
import { getRuntime, initRuntime, type Pose } from '../state/agentRuntime'
import {
  clampNeed, initialNeeds, lowestNeed, needsProfile,
  type Needs, type NeedsProfile,
} from '../state/needs'
import { pushLog, useUiStore, useWorldStore } from '../state/stores'
import { onWorkEvent } from '../agent-client/eventBus'
import { demoDriver } from '../agent-client/DemoDriver'
import { AGENT_DEFS } from '../agent-client/demoAgents'

// ─────────────────────────────────────────────────────────────────────────────
// Simulation Engine (ARCHITECTURE.md §1.3): translates the frozen work-event
// stream into avatar behaviour, and runs the life-simulation schedule when
// no event controls an agent. It never invents work status: every work pose
// traces back to an event on the bus. Phase 5 adds a needs system (energy /
// focus / social) UNDER the schedule: needs steer free-time behaviour only
// and are physically incapable of changing work status — the life layer
// reads mode/pose, it never writes them for event-controlled agents.
// Movement follows the Fase 2 portal
// graph (world/layout.route): interior waypoints → stair portals → doors →
// outdoor hub graph. No teleporting — stair segments interpolate height.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'free' | 'task' | 'meeting'

/** A needs-driven free-time activity (Phase 5 life simulation). Pure
    simulation: it never emits work events and never touches server state. */
interface ActState {
  kind: 'microbreak' | 'rest' | 'social' | 'focus' | 'sport'
  /** simMinutes when the activity ends; 0 = still travelling there. */
  until: number
  dur: number
  pose: Pose
}

interface SimAgent {
  id: string
  index: number
  path: PathPt[]
  goalAnchor: Anchor | null
  onArrive: (() => void) | null
  mode: Mode
  blockKey: string
  celebrateUntil: number
  errorUntil: number
  speakingUntil: number
  meetingExpiresAt: number
  pendingTaskId: string | null
  leisureIdx: number
  /** Phase 5 life simulation (this layer only — never work status). */
  needs: Needs
  profile: NeedsProfile
  act: ActState | null
  blockSince: number
  breakCooldownUntil: number
  chatWith: string | null
  chatUntil: number
  chatCooldownUntil: number
  stillSince: number
  lastPos: Vec2
  /** Current segment bookkeeping for stair-height interpolation. */
  segPt: PathPt | null
  segFromY: number
  segLen: number
}

const simAgents = new Map<string, SimAgent>()
const WALK_SPEED = 3.4 // world units / real second (× sim speed)
const SPAWN: Vec2[] = [
  PLAZA, [16, 8], [2, 24], FIELD, POOL_EDGE,
  [8, 2], [-2, 18], [24, 22], [-44, 4], [40, 6],
]

/** Lake shore (Environment.tsx: lake centre [-56,-34], r≈11) — the quiet
    spot for focus recovery. Outdoor hub routing reaches it like any spot. */
const LAKE_EDGE: Vec2 = [-46, -29]

/** Generic simulated small talk. These lines are INVENTED by the simulation
    for ambience and are labelled "simulasi" in the renderer — they are not,
    and must never be presented as, things the agent actually said. Real
    agent speech exists only in server meeting transcripts (Phase 4). */
const CHAT_LINES = [
  'Ngopi dulu yuk ☕', 'Cuaca lagi enak ya', 'Udah coba menu café baru?',
  'Habis ini jalan ke danau?', 'Weekend santai aja ya', 'Tadi makan siangnya enak',
]
const CHAT_REPLIES = ['Iya, bener banget', 'Haha, iya nih', 'Setuju!', 'Boleh juga tuh', 'Nah, itu dia']

function deskAnchor(agentId: string): Anchor {
  const def = AGENT_DEFS.find((a) => a.id === agentId)!
  if (def.deskIndex === -1) return anchor(CEO_DESK.pos, CEO_DESK.rotY, 0, 'hq')
  if (def.id === 'research') {
    // Fase 2: the Research agent works in the Research building's lab.
    return anchor(RES_DESKS[0].pos, RES_DESKS[0].rotY, 0, 'research')
  }
  if (def.deskIndex === -2) return anchor(DESKS[8].pos, DESKS[8].rotY, 0, 'hq')
  const d = DESKS[def.deskIndex % DESKS.length]
  return anchor(d.pos, d.rotY, 0, 'hq')
}

function roomLabel(a: SimAgent): string {
  const rt = getRuntime(a.id)!
  const [x, z] = rt.pos
  if (rt.building === 'hq') {
    if (rt.floor === 1) return 'HQ · L2 Team floor'
    if (rt.floor === 2) return 'HQ · L3 Meeting floor'
    if (rt.floor === 3) return 'HQ · L4 Lounge'
    if (x > -14 && z < -16) return 'HQ · Meeting room'
    if (x < -26 && z < -16) return 'HQ · CEO office'
    if (z > -8) return 'HQ · Lobby / workspace'
    return 'HQ · Open workspace'
  }
  if (rt.building === 'research') return 'Research · Lab'
  if (rt.building === 'apartment') {
    return `Apartments · Room ${aptRoomIndexAt(rt.pos) + 1} (L${rt.floor + 1})`
  }
  if (insideHQ(rt.pos)) return 'HQ'
  if (insideResearch(rt.pos)) return 'Research building'
  if (insideApartment(rt.pos)) return 'Apartments'
  return 'Outdoor campus'
}

function setGoal(a: SimAgent, target: Anchor, onArrive?: () => void) {
  const rt = getRuntime(a.id)!
  a.path = route({ pos: rt.pos, floor: rt.floor, building: rt.building }, target)
  a.goalAnchor = target
  a.onArrive = onArrive ?? null
  a.segPt = null
  if (a.path.length === 0 && onArrive) {
    const cb = a.onArrive
    a.onArrive = null
    cb?.()
  }
}

function patch(id: string, p: Parameters<ReturnType<typeof useWorldStore.getState>['applyAgentPatch']>[1]) {
  useWorldStore.getState().applyAgentPatch(id, p)
}

function patchTask(id: string, status: 'assigned' | 'working' | 'completed' | 'failed') {
  const s = useWorldStore.getState()
  const t = s.tasks.find((x) => x.id === id)
  if (t) s.upsertTask({ ...t, status })
}

// ── Phase 5: needs-driven free-time activities ──────────────────────────────
// The agent walks (portal graph, no teleport) to the spot that serves its
// lowest need, stays for the activity's duration, then re-evaluates. Every
// label is prefixed "Life sim ·" so the UI never confuses this with work.
function startAct(a: SimAgent, kind: ActState['kind']) {
  const rt = getRuntime(a.id)!
  const act: ActState = {
    kind,
    until: 0,
    dur: kind === 'microbreak' ? 8 : kind === 'rest' || kind === 'sport' ? 25 : 20,
    pose: 'stand',
  }
  a.act = act
  let target: Anchor
  let activity: string
  if (kind === 'microbreak') {
    target = outdoorAnchor(CAFE, Math.PI)
    activity = 'Life sim · micro-break at the café (focus low)'
  } else if (kind === 'rest') {
    if (a.needs.energy < 18) {
      target = homeAnchor(a.index)
      act.pose = 'sit'
      activity = 'Life sim · resting at home (energy low)'
    } else {
      const spot = LOUNGE_SPOTS[a.index % LOUNGE_SPOTS.length]
      target = anchor(spot.pos, spot.rotY, 3, 'hq')
      act.pose = 'sit'
      activity = 'Life sim · resting on the lounge beanbags (energy low)'
    }
  } else if (kind === 'social') {
    a.leisureIdx = (a.leisureIdx + 1) % 2
    target = outdoorAnchor(a.leisureIdx === 0 ? CAFE : PLAZA, Math.PI)
    activity = 'Life sim · hanging out (social low)'
  } else if (kind === 'focus') {
    target = outdoorAnchor(LAKE_EDGE, Math.PI)
    activity = 'Life sim · walk by the lake (focus low)'
  } else {
    target = outdoorAnchor(FIELD, Math.PI)
    activity = 'Life sim · sport on the field'
  }
  patch(a.id, { status: 'walking', activity })
  setGoal(a, target, () => {
    if (a.act !== act) return // superseded while travelling
    act.until = clock + act.dur
    rt.pose = act.pose
    patch(a.id, { status: 'leisure', activity })
  })
}

// ── Event handling (the §1.3 mapping — contract unchanged in Fase 2) ────────
function handleEvent(e: WorkEvent) {
  const a = simAgents.get(e.agentId)
  if (!a) return
  const rt = getRuntime(e.agentId)!
  const name = AGENT_DEFS.find((d) => d.id === e.agentId)?.name ?? e.agentId

  switch (e.type) {
    case 'task.assigned': {
      a.mode = 'task'
      a.pendingTaskId = e.taskId ?? null
      const desk = deskAnchor(e.agentId)
      patch(e.agentId, { status: 'walking', activity: 'Heading to desk — task assigned', currentTaskId: e.taskId ?? null })
      if (e.taskId) patchTask(e.taskId, 'assigned')
      setGoal(a, desk, () => {
        rt.pose = 'sit'
        patch(e.agentId, { status: 'idle', activity: 'At desk, starting…' })
        if (e.taskId) demoDriver.notifyArrivedAtDesk(e.agentId, e.taskId)
      })
      break
    }
    case 'task.started':
      rt.pose = 'typing'
      if (e.taskId) patchTask(e.taskId, 'working')
      patch(e.agentId, { status: 'working', activity: 'Working on task (demo script)' })
      break
    case 'run.thinking':
      rt.pose = 'thinking'
      patch(e.agentId, { status: 'thinking', activity: 'Thinking…' })
      break
    case 'tool.started':
      rt.pose = 'typing'
      patch(e.agentId, { status: 'working', activity: `Using tool: ${String(e.payload?.tool ?? 'demo-tool')}` })
      break
    case 'tool.finished':
      rt.pose = 'typing'
      patch(e.agentId, { status: 'working', activity: 'Working on task (demo script)' })
      break
    case 'run.waiting_input':
      rt.pose = 'sit'
      rt.badge = '?'
      patch(e.agentId, { status: 'idle', activity: 'Waiting for input' })
      break
    case 'task.collaboration': {
      a.mode = 'meeting'
      a.meetingExpiresAt = e.simMinutes + 45
      const seat = MEETING_SEATS[Number(e.payload?.seatIndex ?? 0) % MEETING_SEATS.length]
      patch(e.agentId, { status: 'walking', activity: 'Heading to meeting room' })
      setGoal(a, anchor(seat.pos, seat.rotY, 0, 'hq'), () => {
        rt.pose = 'sit'
        patch(e.agentId, { status: 'meeting', activity: 'In meeting (demo)' })
      })
      break
    }
    case 'meeting.speaking':
      if (a.mode === 'meeting') {
        a.speakingUntil = e.simMinutes + 2
        rt.pose = 'talking'
        patch(e.agentId, { status: 'meeting', activity: 'Speaking in meeting (demo)' })
      }
      break
    case 'task.completed': {
      a.mode = 'free'
      a.pendingTaskId = null
      a.celebrateUntil = e.simMinutes + 2
      rt.pose = 'celebrate'
      rt.badge = null
      if (e.taskId) patchTask(e.taskId, 'completed')
      const cur = useWorldStore.getState().agents.find((x) => x.id === e.agentId)
      patch(e.agentId, {
        status: 'celebrating', activity: 'Task completed 🎉',
        currentTaskId: null, tasksDone: (cur?.tasksDone ?? 0) + 1,
      })
      pushLog(`${name} finished a task (${e.source === 'live' ? 'live' : 'demo'})`, 'done')
      break
    }
    case 'task.failed': {
      a.mode = 'free'
      a.pendingTaskId = null
      a.errorUntil = e.simMinutes + 3
      rt.pose = 'error'
      rt.badge = '!'
      if (e.taskId) patchTask(e.taskId, 'failed')
      patch(e.agentId, { status: 'error', activity: 'Task failed (demo event)', currentTaskId: null })
      break
    }
    case 'agent.offline': {
      // §1.3 mapping: offline → returns to apartment, sleeps.
      a.mode = 'free'
      patch(e.agentId, { status: 'walking', activity: 'Going home — offline' })
      setGoal(a, homeAnchor(a.index), () => {
        rt.pose = 'sleep'
        rt.badge = 'Z'
        patch(e.agentId, { status: 'idle', activity: 'Offline — resting at home' })
      })
      break
    }
  }
}

// ── Schedule (life simulation; fills gaps when no event controls the agent) ─
function scheduleBlock(simMinutes: number): { key: string; kind: 'work' | 'lunch' | 'leisure' | 'sport' | 'rest' } {
  const h = Math.floor((simMinutes % (24 * 60)) / 60)
  if (h >= 8 && h < 12) return { key: 'work-am', kind: 'work' }
  if (h >= 12 && h < 13) return { key: 'lunch', kind: 'lunch' }
  if (h >= 13 && h < 17) return { key: 'work-pm', kind: 'work' }
  if (h >= 17 && h < 19) return { key: 'sport', kind: 'sport' }
  if (h >= 19 || h < 7) return { key: 'rest', kind: 'rest' }
  return { key: 'morning', kind: 'leisure' }
}

function applySchedule(a: SimAgent, simMinutes: number) {
  const block = scheduleBlock(simMinutes)
  if (a.blockKey === block.key && a.goalAnchor) return
  if (a.blockKey !== block.key) a.blockSince = simMinutes
  a.blockKey = block.key
  const rt = getRuntime(a.id)!
  rt.badge = null
  if (block.kind === 'work') {
    const desk = deskAnchor(a.id)
    patch(a.id, { status: 'walking', activity: 'Heading to desk (schedule)' })
    setGoal(a, desk, () => {
      rt.pose = 'typing'
      patch(a.id, { status: 'working', activity: 'At desk — scheduled work block' })
    })
  } else if (block.kind === 'lunch') {
    const spot = LOUNGE_SPOTS[a.index % LOUNGE_SPOTS.length]
    patch(a.id, { status: 'walking', activity: 'Heading to lunch — HQ lounge (L4)' })
    setGoal(a, anchor(spot.pos, spot.rotY, 3, 'hq'), () => {
      rt.pose = 'sit'
      patch(a.id, { status: 'leisure', activity: 'Lunch break — HQ lounge (L4)' })
    })
  } else if (block.kind === 'rest') {
    patch(a.id, { status: 'walking', activity: 'Heading home — apartment' })
    setGoal(a, homeAnchor(a.index), () => {
      rt.pose = 'sleep'
      rt.badge = 'Z'
      patch(a.id, { status: 'idle', activity: 'At home — resting (off hours)' })
    })
  } else {
    // Leisure / sport / morning blocks (Phase 5): the LOWEST need chooses
    // the activity — rest, company, or a focus walk. The sport block only
    // wins when no need is critical (< 30); a drained agent serves its need.
    const low = lowestNeed(a.needs, a.profile)
    const lowVal = low === 'rest' ? a.needs.energy : low === 'focus' ? a.needs.focus : a.needs.social
    const kind: ActState['kind'] =
      block.kind === 'sport' && a.needs.energy > 35 && lowVal >= 30 ? 'sport' : low
    startAct(a, kind)
  }
}

// ── Phase 5 per-minute life simulation ──────────────────────────────────────
// Runs once per sim minute. Reads behaviour state, writes ONLY needs/chat —
// never work status, never the event bus, never the server. Zero LLM calls
// originate here: leisure is arithmetic, not intelligence.
function tickNeeds(a: SimAgent) {
  const rt = getRuntime(a.id)!
  const n = a.needs
  const p = a.profile
  if (rt.pose === 'sleep') {
    n.energy += 2.4; n.focus += 1.4; n.social -= 0.1
  } else if (a.chatWith) {
    n.social += 2.6; n.focus += 0.2; n.energy -= 0.1
  } else if (a.act && a.act.until > 0) {
    switch (a.act.kind) {
      case 'rest': n.energy += 1.8; n.focus += 0.5; break
      case 'social': n.social += 1.9; n.focus += 0.2; n.energy -= 0.1; break
      case 'focus': n.focus += 1.7; n.energy -= 0.05; break
      case 'sport': n.energy -= 0.5; n.focus += 0.8; n.social += 0.6; break
      case 'microbreak': n.focus += 2.2; n.energy += 0.4; break
    }
  } else if (a.mode !== 'free' || rt.pose === 'typing' || rt.pose === 'thinking') {
    // Real/demo work drains — but needs NEVER feed back into work status.
    n.focus -= 0.55 * p.drainMul; n.energy -= 0.26 * p.drainMul; n.social -= 0.12
  } else if (rt.moving) {
    n.energy -= 0.15; n.social -= 0.05
  } else if (a.blockKey === 'lunch' && rt.pose === 'sit') {
    n.energy += 0.9; n.social += 1.2; n.focus += 0.4
  } else {
    n.energy -= 0.08; n.focus -= 0.05; n.social -= 0.18
  }
  n.energy = clampNeed(n.energy)
  n.focus = clampNeed(n.focus)
  n.social = clampNeed(n.social)
  useWorldStore.getState().setNeeds(a.id, { ...n })
}

/** Pair up agents idling at the same leisure spot for a short simulated
    chat: talking pose + generic bubble (labelled simulasi in the UI). */
function tickChat(simMinutes: number) {
  for (const a of simAgents.values()) {
    if (a.chatWith && simMinutes >= a.chatUntil) {
      const rt = getRuntime(a.id)!
      rt.chat = null
      if (rt.pose === 'talking' && a.mode === 'free') rt.pose = a.act ? a.act.pose : 'stand'
      a.chatWith = null
      a.chatCooldownUntil = simMinutes + 8
    }
  }
  const idle = [...simAgents.values()].filter(
    (a) => a.mode === 'free' && a.act && a.act.until > 0 && !a.chatWith && simMinutes >= a.chatCooldownUntil,
  )
  for (let i = 0; i < idle.length; i++) {
    const a = idle[i]
    if (a.chatWith) continue
    const ra = getRuntime(a.id)!
    for (let j = i + 1; j < idle.length; j++) {
      const b = idle[j]
      if (b.chatWith) continue
      const rb = getRuntime(b.id)!
      if (ra.building !== rb.building) continue
      if (Math.hypot(ra.pos[0] - rb.pos[0], ra.pos[1] - rb.pos[1]) > 4.5) continue
      a.chatWith = b.id
      b.chatWith = a.id
      a.chatUntil = b.chatUntil = simMinutes + 3
      ra.chat = CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)]
      rb.chat = CHAT_REPLIES[Math.floor(Math.random() * CHAT_REPLIES.length)]
      ra.pose = 'talking'
      rb.pose = 'talking'
      ra.heading = Math.atan2(rb.pos[0] - ra.pos[0], rb.pos[1] - ra.pos[1])
      rb.heading = Math.atan2(ra.pos[0] - rb.pos[0], ra.pos[1] - rb.pos[1])
      break
    }
  }
}

/** §6 watchdog: a free agent standing still >5 sim-minutes with no activity,
    no path and no legitimate pose is stuck — log it and re-apply schedule. */
function tickWatchdog(a: SimAgent, simMinutes: number) {
  const rt = getRuntime(a.id)!
  const moved = Math.hypot(rt.pos[0] - a.lastPos[0], rt.pos[1] - a.lastPos[1]) > 0.05
  if (moved || rt.moving || a.path.length > 0) {
    a.lastPos = [...rt.pos]
    a.stillSince = simMinutes
    return
  }
  const legit = a.act !== null || a.mode !== 'free' || rt.pose !== 'stand'
  if (!legit && simMinutes - a.stillSince > 5) {
    const name = AGENT_DEFS.find((d) => d.id === a.id)?.name ?? a.id
    pushLog(`Watchdog: ${name} stood idle >5 sim-min with no activity — schedule re-applied`, 'info')
    a.blockKey = ''
    a.stillSince = simMinutes
  }
}

// ── Main tick ────────────────────────────────────────────────────────────────
let lastMinute = -1
let clock = 8 * 60 // internal virtual clock (minutes); store is updated 1×/min

function tick(dtReal: number) {
  const ui = useUiStore.getState()
  if (!ui.playing) return
  const world = useWorldStore.getState()
  clock += dtReal * ui.speed // 1 real s = 1 sim min at 1×
  const simMinutes = clock
  if (Math.floor(simMinutes) !== lastMinute) world.setSimMinutes(simMinutes)

  const speedScale = ui.speed
  for (const a of simAgents.values()) {
    const rt = getRuntime(a.id)!
    const agentState = world.agents.find((x) => x.id === a.id)
    if (agentState?.paused) {
      rt.moving = false
      if (agentState.status !== 'paused') patch(a.id, { status: 'paused', activity: 'Paused by user' })
      continue
    }
    if (agentState?.status === 'paused') patch(a.id, { status: 'idle', activity: 'Resumed' })

    if (a.mode === 'meeting' && a.meetingExpiresAt > 0) {
      if (simMinutes >= a.meetingExpiresAt) {
        a.mode = 'free'
        a.meetingExpiresAt = 0
        a.blockKey = ''
        rt.pose = 'stand'
        patch(a.id, { status: 'idle', activity: 'Meeting ended' })
      }
    }
    if (a.mode === 'free' && rt.pose !== 'celebrate' && rt.pose !== 'error') {
      // Phase 5: an ongoing activity governs the agent until it ends or the
      // schedule block that legitimised it goes away (micro-breaks live only
      // inside work blocks; leisure acts only outside them).
      if (a.act) {
        const blk = scheduleBlock(simMinutes)
        const valid = a.act.kind === 'microbreak'
          ? blk.kind === 'work'
          : blk.kind === 'leisure' || blk.kind === 'sport'
        if (!valid || (a.act.until > 0 && simMinutes >= a.act.until)) {
          if (a.act.kind === 'microbreak') a.breakCooldownUntil = simMinutes + 30
          a.act = null
          a.blockKey = ''
        }
      }
      if (!a.act) {
        const blk = scheduleBlock(simMinutes)
        // Micro-break: focus collapsed mid-work-block → café, briefly. Only
        // in 'free' mode — an agent on a task (either source) is NEVER
        // pulled away by its simulated body.
        if (
          blk.kind === 'work' &&
          a.needs.focus < a.profile.focusBreakAt &&
          simMinutes - a.blockSince > 20 &&
          simMinutes >= a.breakCooldownUntil
        ) {
          startAct(a, 'microbreak')
        } else {
          applySchedule(a, simMinutes)
        }
      }
    }
    if (simMinutes >= a.celebrateUntil && rt.pose === 'celebrate') {
      rt.pose = 'stand'
      a.blockKey = ''
      patch(a.id, { status: 'idle', activity: 'Back to schedule' })
    }
    if (simMinutes >= a.errorUntil && rt.pose === 'error') {
      rt.pose = 'stand'
      rt.badge = null
      a.blockKey = ''
      patch(a.id, { status: 'idle', activity: 'Recovered' })
    }
    if (a.speakingUntil > 0 && simMinutes >= a.speakingUntil && a.mode === 'meeting') {
      rt.pose = 'sit'
      a.speakingUntil = 0
      patch(a.id, { status: 'meeting', activity: 'In meeting (demo)' })
    }

    // Movement along the portal-graph path. Height interpolates across each
    // segment, so stair portals read as climbing, never as floating/teleport.
    if (a.path.length > 0) {
      rt.moving = true
      if (rt.pose !== 'celebrate' && rt.pose !== 'error') rt.pose = 'walk'
      const target = a.path[0]
      if (a.segPt !== target) {
        a.segPt = target
        a.segFromY = rt.y
        a.segLen = Math.max(0.001, Math.hypot(target.pos[0] - rt.pos[0], target.pos[1] - rt.pos[1]))
      }
      const dx = target.pos[0] - rt.pos[0]
      const dz = target.pos[1] - rt.pos[1]
      const dist = Math.hypot(dx, dz)
      const step = WALK_SPEED * speedScale * dtReal
      rt.heading = Math.atan2(dx, dz)
      const targetY = target.floor * FLOOR_H
      if (dist <= step) {
        rt.pos = [target.pos[0], target.pos[1]]
        rt.y = targetY
        rt.floor = target.floor
        a.path.shift()
        a.segPt = null
        if (a.path.length === 0) {
          rt.moving = false
          if (a.goalAnchor) {
            rt.floor = a.goalAnchor.floor
            rt.building = a.goalAnchor.building
            rt.y = a.goalAnchor.floor * FLOOR_H
            rt.heading = a.goalAnchor.rotY
          }
          patch(a.id, { currentRoomId: roomLabel(a) })
          const cb = a.onArrive
          a.onArrive = null
          cb?.()
        }
      } else {
        rt.pos = [rt.pos[0] + (dx / dist) * step, rt.pos[1] + (dz / dist) * step]
        const progress = Math.min(1, Math.max(0, 1 - dist / a.segLen))
        rt.y = a.segFromY + (targetY - a.segFromY) * progress
        if (targetY !== a.segFromY) rt.floor = target.floor
      }
      rt.phase += dtReal * speedScale * 2.4
    } else {
      rt.moving = false
      rt.phase += dtReal * 0.6
    }
  }

  const minute = Math.floor(simMinutes)
  if (minute !== lastMinute) {
    lastMinute = minute
    tickChat(simMinutes)
    for (const a of simAgents.values()) {
      tickNeeds(a)
      tickWatchdog(a, simMinutes)
      patch(a.id, { currentRoomId: roomLabel(a) })
    }
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
let started = false
export function startSimulation() {
  if (started) return
  started = true
  // Dev/QA affordance: ?t=HH:MM starts the virtual clock at that time so
  // schedule scenarios (lunch, clock-out) can be verified in screenshots.
  const t = new URLSearchParams(window.location.search).get('t')
  if (t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t)
    if (m) clock = Number(m[1]) * 60 + Number(m[2])
  }
  AGENT_DEFS.forEach((def, i) => {
    initRuntime(def.id, SPAWN[i % SPAWN.length])
    simAgents.set(def.id, {
      id: def.id, index: i, path: [], goalAnchor: null, onArrive: null,
      mode: 'free', blockKey: '', celebrateUntil: 0, errorUntil: 0,
      speakingUntil: 0, meetingExpiresAt: 0, pendingTaskId: null,
      leisureIdx: i, segPt: null, segFromY: 0, segLen: 1,
      needs: initialNeeds(def.id), profile: needsProfile(def.id), act: null,
      blockSince: clock, breakCooldownUntil: 0, chatWith: null, chatUntil: 0,
      chatCooldownUntil: 0, stillSince: clock, lastPos: SPAWN[i % SPAWN.length],
    })
  })
  // QA affordance (same spirit as ?t=): probes read life-sim state, and may
  // seed needs to stage deterministic scenarios. Simulation layer only.
  const w = window as unknown as Record<string, unknown>
  w.__lifeSim = () =>
    [...simAgents.values()].map((a) => {
      const rt = getRuntime(a.id)!
      return {
        id: a.id, needs: { ...a.needs }, act: a.act?.kind ?? null,
        mode: a.mode, pose: rt.pose, pos: [...rt.pos], building: rt.building,
        chatWith: a.chatWith, activity: useWorldStore.getState().agents.find((x) => x.id === a.id)?.activity ?? '',
      }
    })
  w.__lifeSimSet = (id: string, n: Partial<Needs>) => {
    const a = simAgents.get(id)
    if (!a) return false
    Object.assign(a.needs, n)
    useWorldStore.getState().setNeeds(id, { ...a.needs })
    return true
  }
  w.__simClock = () => clock
  onWorkEvent(handleEvent)
  demoDriver.onArrivedAtDesk = (agentId, taskId) => demoDriver.notifyArrivedAtDesk(agentId, taskId)
  demoDriver.start()
  let last = performance.now()
  setInterval(() => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    tick(dt)
  }, 33)
  pushLog('Simulation started — virtual clock running, DEMO mode.', 'info')
}
