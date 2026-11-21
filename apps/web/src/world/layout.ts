// Single source of truth for world geometry, anchors and portal routing.
// Coordinates are meters in world space. Fase 2 (ARCHITECTURE.md §2.3): one
// global portal graph — interior waypoints → stairs/lift portals → building
// doors → an outdoor hub graph → destination door → interior. Agents never
// teleport: every leg is a walked segment, and stair segments carry a floor
// change that the renderer turns into a climb.

import type { BuildingId } from '../state/agentRuntime'

export type Vec2 = [number, number]
export type { BuildingId }

export const FLOOR_H = 3.8
/** World-space Y of a floor level index (0 = ground). */
export const floorY = (level: number) => level * FLOOR_H

/** A navigation target: where, which way to face, on which floor/building. */
export interface Anchor {
  pos: Vec2
  rotY: number
  floor: number
  building: BuildingId
}

/** One walked path segment endpoint; floor changes mark stair portals. */
export interface PathPt {
  pos: Vec2
  floor: number
}

export const anchor = (pos: Vec2, rotY: number, floor: number, building: BuildingId): Anchor => ({
  pos, rotY, floor, building,
})
export const outdoorAnchor = (pos: Vec2, rotY = 0): Anchor => anchor(pos, rotY, 0, 'outdoor')

// ── HQ (office district) ────────────────────────────────────────────────────
export const HQ_CENTER: Vec2 = [-20, -12]
export const HQ_W = 38
export const HQ_D = 26
export const HQ_FLOOR_Y = 0.12
export const HQ_FLOORS = 4

const [hx, hz] = HQ_CENTER
export const HQ_MIN_X = hx - HQ_W / 2
export const HQ_MAX_X = hx + HQ_W / 2
export const HQ_MIN_Z = hz - HQ_D / 2
export const HQ_MAX_Z = hz + HQ_D / 2

export const DOOR_OUT: Vec2 = [hx, HQ_MAX_Z + 3]
export const DOOR_IN: Vec2 = [hx, HQ_MAX_Z - 3]
export const AISLE: Vec2 = [hx, hz + 1]
export const LOBBY: Vec2 = [hx - 8, HQ_MAX_Z - 6]
/** Corridor waypoint used on every HQ floor (same xz as the L1 aisle). */
export const CORRIDOR: Vec2 = AISLE

/** Stairwell: west bay. Flights zigzag — bottom lands south, top lands north. */
export const STAIR_X = hx - 16.6
export const STAIR_Z_BOT = hz + 9.9
export const STAIR_Z_TOP = hz + 4.3
export const STAIR_APPROACH: Vec2 = [hx - 13.2, hz + 7]
export const STAIR_BOT: Vec2 = [STAIR_X, STAIR_Z_BOT]
export const STAIR_TOP: Vec2 = [STAIR_X, STAIR_Z_TOP]

export type DeskSpot = { pos: Vec2; rotY: number }

/** L1: 10 desks, two rows of five in the open workspace. */
export const DESKS: DeskSpot[] = (() => {
  const out: DeskSpot[] = []
  for (let i = 0; i < 5; i++) out.push({ pos: [hx - 12 + i * 6, hz - 3.4], rotY: 0 })
  for (let i = 0; i < 5; i++) out.push({ pos: [hx - 12 + i * 6, hz + 5.4], rotY: Math.PI })
  return out
})()

/** L2 (team floor): 8 desks in two team clusters. Decorative in Fase 2 —
    the 10 demo agents keep their L1 desks (protects the §7 live proof). */
export const DESKS_L2: DeskSpot[] = (() => {
  const out: DeskSpot[] = []
  for (let i = 0; i < 4; i++) out.push({ pos: [hx - 11 + i * 5.5, hz - 4], rotY: 0 })
  for (let i = 0; i < 4; i++) out.push({ pos: [hx - 11 + i * 5.5, hz + 4.6], rotY: Math.PI })
  return out
})()

/** Meeting room L1: NE corner. */
export const MEETING_TABLE: Vec2 = [hx + 12.5, hz - 7.5]
export const MEETING_SEATS: DeskSpot[] = [
  { pos: [MEETING_TABLE[0] - 3, MEETING_TABLE[1] - 2.2], rotY: 0 },
  { pos: [MEETING_TABLE[0], MEETING_TABLE[1] - 2.2], rotY: 0 },
  { pos: [MEETING_TABLE[0] + 3, MEETING_TABLE[1] - 2.2], rotY: 0 },
  { pos: [MEETING_TABLE[0] - 3, MEETING_TABLE[1] + 2.2], rotY: Math.PI },
  { pos: [MEETING_TABLE[0], MEETING_TABLE[1] + 2.2], rotY: Math.PI },
  { pos: [MEETING_TABLE[0] + 3, MEETING_TABLE[1] + 2.2], rotY: Math.PI },
]
export const MEETING_DOOR: Vec2 = [hx + 7.5, hz - 7.5]

/** Meeting room L3: same footprint as L1, 8 seats. */
export const MEETING2_TABLE: Vec2 = MEETING_TABLE
export const MEETING2_SEATS: DeskSpot[] = [-4.5, -1.5, 1.5, 4.5].flatMap((dx) => [
  { pos: [MEETING2_TABLE[0] + dx, MEETING2_TABLE[1] - 2.2] as Vec2, rotY: 0 },
  { pos: [MEETING2_TABLE[0] + dx, MEETING2_TABLE[1] + 2.2] as Vec2, rotY: Math.PI },
])
export const MEETING2_DOOR: Vec2 = MEETING_DOOR

/** CEO office L1: NW corner. */
export const CEO_DESK: DeskSpot = { pos: [hx - 14.5, hz - 8.5], rotY: 0 }
export const CEO_DOOR: Vec2 = [hx - 9.5, hz - 7.5]

/** Focus pods L1 (east wall) and L3 (west wall). */
export const PODS: DeskSpot[] = [0, 1, 2].map((i) => ({
  pos: [hx + 16.2, hz + 1 + i * 4.2] as Vec2,
  rotY: -Math.PI / 2,
}))
export const PODS_L3: DeskSpot[] = [
  { pos: [hx - 17.6, hz - 6], rotY: Math.PI / 2 },
  { pos: [hx - 17.6, hz - 0.5], rotY: Math.PI / 2 },
]

/** L4 lounge anchors — the lunch block destination (stairs get daily use). */
export const LOUNGE_SPOTS: DeskSpot[] = [
  { pos: [hx - 12, hz - 1.2], rotY: 0 },
  { pos: [hx - 8, hz + 4], rotY: Math.PI },
  { pos: [hx - 3, hz - 1.2], rotY: 0 },
  { pos: [hx + 2, hz + 4.2], rotY: Math.PI },
  { pos: [hx + 7, hz - 1.2], rotY: 0 },
  { pos: [hx + 12, hz + 3.5], rotY: Math.PI },
  { pos: [hx - 14, hz + 7.5], rotY: Math.PI / 2 },
  { pos: [hx - 5, hz + 7.5], rotY: Math.PI },
  { pos: [hx + 5, hz + 7.5], rotY: Math.PI },
  { pos: [hx + 14, hz + 7.5], rotY: -Math.PI / 2 },
]

// ── Research building (research district) ───────────────────────────────────
export const RES_CENTER: Vec2 = [14, -34]
export const RES_W = 24
export const RES_D = 16
const [rx, rz] = RES_CENTER
export const RES_MIN_X = rx - RES_W / 2
export const RES_MAX_X = rx + RES_W / 2
export const RES_MIN_Z = rz - RES_D / 2
export const RES_MAX_Z = rz + RES_D / 2
export const RES_DOOR_OUT: Vec2 = [rx, RES_MAX_Z + 3.5]
export const RES_DOOR_IN: Vec2 = [rx, RES_MAX_Z - 3]
export const RES_HALL: Vec2 = [rx, rz + 3]
export const RES_DESKS: DeskSpot[] = [
  { pos: [rx - 7, rz - 4.5], rotY: 0 },
  { pos: [rx + 7, rz - 4.5], rotY: 0 },
]
export const RES_BENCHES: Vec2[] = [
  [rx - 6, rz + 0.5],
  [rx, rz + 0.5],
  [rx + 6, rz + 0.5],
]

// ── Apartments (residential district): 2 floors × 5 rooms, one per agent ────
export const APT_CENTER: Vec2 = [-56, -8]
export const APT_W = 30
export const APT_D = 12
export const APT_FLOORS = 2
const [ax, az] = APT_CENTER
export const APT_MIN_X = ax - APT_W / 2
export const APT_MAX_X = ax + APT_W / 2
export const APT_MIN_Z = az - APT_D / 2
export const APT_MAX_Z = az + APT_D / 2
export const APT_DOOR_OUT: Vec2 = [ax - 10, APT_MAX_Z + 2.5]
export const APT_DOOR_IN: Vec2 = [ax - 10, APT_MAX_Z - 3.4]
export const APT_CORRIDOR: Vec2 = [ax, az]
export const APT_PART_Z = az - 1.2 // room/corridor partition line
export const APT_DOOR_Z = az - 0.7 // room door waypoint line
/** Room centre x per room index 0..4 (west → east). Stair bay takes the east end. */
export const APT_ROOM_XS: number[] = [0, 1, 2, 3, 4].map((i) => ax - 12.4 + i * 5.2)
export const APT_STAIR_X = ax + 13
export const APT_STAIR_BOT: Vec2 = [APT_STAIR_X, az + 2.8]
export const APT_STAIR_TOP: Vec2 = [APT_STAIR_X, az - 3]
export const APT_STAIR_APPROACH: Vec2 = [ax + 9.5, az + 1.2]

/** Home anchor for agent index i (0..9): room i%5 on floor ⌊i/5⌋. */
export function homeAnchor(agentIndex: number): Anchor {
  const room = agentIndex % 5
  const floor = Math.floor(agentIndex / 5) % APT_FLOORS
  return anchor([APT_ROOM_XS[room], az - 3.3], Math.PI, floor, 'apartment')
}
export function homeBedCenter(agentIndex: number): { pos: Vec2; floor: number } {
  const room = agentIndex % 5
  const floor = Math.floor(agentIndex / 5) % APT_FLOORS
  return { pos: [APT_ROOM_XS[room], az - 4.6], floor }
}
export function aptRoomIndexAt(pos: Vec2): number {
  let best = 0
  let bd = Infinity
  APT_ROOM_XS.forEach((x, i) => {
    const d = Math.abs(x - pos[0])
    if (d < bd) { bd = d; best = i }
  })
  return best
}

// ── Outdoor leisure spots ───────────────────────────────────────────────────
export const PLAZA: Vec2 = [16, 14]
export const FOUNTAIN: Vec2 = [16, 8]
export const POOL_EDGE: Vec2 = [30, -16]
export const POOL_SWIM: Vec2 = [33, -20]
export const FIELD: Vec2 = [-34, 20]
export const CAFE: Vec2 = [2, 24]
export const LEISURE_SPOTS: Vec2[] = [PLAZA, POOL_EDGE, FIELD, CAFE, FOUNTAIN]

// ── Footprints ──────────────────────────────────────────────────────────────
export function insideHQ(p: Vec2): boolean {
  return p[0] > HQ_MIN_X && p[0] < HQ_MAX_X && p[1] > HQ_MIN_Z && p[1] < HQ_MAX_Z
}
export function insideResearch(p: Vec2): boolean {
  return p[0] > RES_MIN_X && p[0] < RES_MAX_X && p[1] > RES_MIN_Z && p[1] < RES_MAX_Z
}
export function insideApartment(p: Vec2): boolean {
  return p[0] > APT_MIN_X && p[0] < APT_MAX_X && p[1] > APT_MIN_Z && p[1] < APT_MAX_Z
}
export function insideAnyBuilding(p: Vec2): boolean {
  return insideHQ(p) || insideResearch(p) || insideApartment(p)
}

// ── Portal graph routing (§2.3) ─────────────────────────────────────────────
interface BuildingDef {
  doorIn: Vec2
  doorOut: Vec2
  floors: number
  stair: { approach: Vec2; bot: Vec2; top: Vec2 } | null
  corridor: Vec2
}

const BUILDINGS: Record<Exclude<BuildingId, 'outdoor'>, BuildingDef> = {
  hq: {
    doorIn: DOOR_IN, doorOut: DOOR_OUT, floors: HQ_FLOORS,
    stair: { approach: STAIR_APPROACH, bot: STAIR_BOT, top: STAIR_TOP },
    corridor: CORRIDOR,
  },
  research: {
    doorIn: RES_DOOR_IN, doorOut: RES_DOOR_OUT, floors: 1,
    stair: null, corridor: RES_HALL,
  },
  apartment: {
    doorIn: APT_DOOR_IN, doorOut: APT_DOOR_OUT, floors: APT_FLOORS,
    stair: { approach: APT_STAIR_APPROACH, bot: APT_STAIR_BOT, top: APT_STAIR_TOP },
    corridor: APT_CORRIDOR,
  },
}

/** Flat (single-floor) interior routing inside one building. */
function interiorFlat(b: Exclude<BuildingId, 'outdoor'>, from: Vec2, to: Vec2, out: PathPt[], floor: number) {
  const push = (p: Vec2) => out.push({ pos: p, floor })
  if (b === 'hq' && floor === 0) {
    // Fase 1 hand-tuned L1 routing, kept verbatim: room doors + aisle.
    const nearMeeting = Math.hypot(to[0] - MEETING_TABLE[0], to[1] - MEETING_TABLE[1]) < 7
    const nearCeo = Math.hypot(to[0] - CEO_DESK.pos[0], to[1] - CEO_DESK.pos[1]) < 5
    if (nearMeeting) push(MEETING_DOOR)
    else if (nearCeo) push(CEO_DOOR)
    else push(AISLE)
    push(to)
    return
  }
  if (b === 'apartment') {
    // Rooms sit behind the partition line; enter via corridor + own door gap.
    const fromRoom = from[1] < APT_PART_Z
    const toRoom = to[1] < APT_PART_Z
    if (fromRoom) push([from[0], APT_DOOR_Z])
    if (fromRoom || toRoom) push(APT_CORRIDOR)
    if (toRoom) push([to[0], APT_DOOR_Z])
    push(to)
    return
  }
  // Generic: corridor waypoint, then straight to target.
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 4) push(BUILDINGS[b].corridor)
  push(to)
}

/** Interior routing incl. stair portals between floors of one building. */
function interiorPath(
  b: Exclude<BuildingId, 'outdoor'>,
  from: Vec2, fromFloor: number,
  to: Vec2, toFloor: number,
): PathPt[] {
  const def = BUILDINGS[b]
  const out: PathPt[] = []
  if (fromFloor === toFloor || !def.stair) {
    interiorFlat(b, from, to, out, fromFloor)
    return out
  }
  const { approach, bot, top } = def.stair
  interiorFlat(b, from, approach, out, fromFloor)
  let f = fromFloor
  let lastXZ: Vec2 = approach
  while (f < toFloor) {
    out.push({ pos: bot, floor: f })
    out.push({ pos: top, floor: f + 1 })
    lastXZ = top
    f++
  }
  while (f > toFloor) {
    out.push({ pos: top, floor: f })
    out.push({ pos: bot, floor: f - 1 })
    lastXZ = bot
    f--
  }
  interiorFlat(b, lastXZ, to, out, toFloor)
  return out
}

// Outdoor hub graph: building doors + plaza, with hand-designed lanes that
// keep segments clear of the building footprints.
type NodeId = 'hqDoor' | 'resDoor' | 'aptDoor' | 'plaza'
const NODE_POS: Record<NodeId, Vec2> = {
  hqDoor: DOOR_OUT, resDoor: RES_DOOR_OUT, aptDoor: APT_DOOR_OUT, plaza: PLAZA,
}
const EDGES: { a: NodeId; b: NodeId; lanes: Vec2[] }[] = [
  { a: 'hqDoor', b: 'resDoor', lanes: [[6, 6], [8, -14]] },
  { a: 'hqDoor', b: 'aptDoor', lanes: [[-38, 5]] },
  { a: 'hqDoor', b: 'plaza', lanes: [] },
  { a: 'resDoor', b: 'plaza', lanes: [] },
  { a: 'aptDoor', b: 'plaza', lanes: [] },
]

const RECTS: [number, number, number, number][] = [
  [HQ_MIN_X - 1, HQ_MIN_Z - 1, HQ_MAX_X + 1, HQ_MAX_Z + 1],
  [RES_MIN_X - 1, RES_MIN_Z - 1, RES_MAX_X + 1, RES_MAX_Z + 1],
  [APT_MIN_X - 1, APT_MIN_Z - 1, APT_MAX_X + 1, APT_MAX_Z + 1],
]

function segHitsRect(a: Vec2, b: Vec2, r: [number, number, number, number]): boolean {
  // Liang–Barsky clip: true when the segment touches the rect interior.
  const [x1, z1, x2, z2] = r
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const p = [-dx, dx, -dz, dz]
  const q = [a[0] - x1, x2 - a[0], a[1] - z1, z2 - a[1]]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t }
      else { if (t < t0) return false; if (t < t1) t1 = t }
    }
  }
  return t0 <= t1
}

function segClear(a: Vec2, b: Vec2): boolean {
  const inRect = (p: Vec2, r: [number, number, number, number]) =>
    p[0] > r[0] && p[0] < r[2] && p[1] > r[1] && p[1] < r[3]
  // An endpoint at a building/deck is a legitimate destination, not a crossing.
  if (RECTS.some((r) => inRect(a, r) || inRect(b, r))) return true
  return !RECTS.some((r) => segHitsRect(a, b, r))
}

function graphPath(from: NodeId, to: NodeId): Vec2[] {
  if (from === to) return [NODE_POS[from]]
  // Dijkstra over 4 nodes — trivially small, kept explicit for clarity.
  const dist = new Map<NodeId, number>([[from, 0]])
  const prev = new Map<NodeId, { node: NodeId; lanes: Vec2[] }>()
  const done = new Set<NodeId>()
  for (;;) {
    let cur: NodeId | null = null
    let best = Infinity
    for (const [n, d] of dist) {
      if (!done.has(n) && d < best) { best = d; cur = n }
    }
    if (cur === null || cur === to) break
    done.add(cur)
    for (const e of EDGES) {
      const other = e.a === cur ? e.b : e.b === cur ? e.a : null
      if (!other) continue
      const w = Math.hypot(NODE_POS[cur][0] - NODE_POS[other][0], NODE_POS[cur][1] - NODE_POS[other][1])
      const nd = best + w
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd)
        const lanes = e.a === cur ? e.lanes : [...e.lanes].reverse()
        prev.set(other, { node: cur, lanes })
      }
    }
  }
  const pts: Vec2[] = []
  let cur: NodeId = to
  const chain: { node: NodeId; lanes: Vec2[] }[] = []
  while (cur !== from) {
    const p = prev.get(cur)
    if (!p) return [NODE_POS[to]]
    chain.unshift({ node: cur, lanes: p.lanes })
    cur = p.node
  }
  pts.push(NODE_POS[from])
  for (const step of chain) {
    pts.push(...step.lanes, NODE_POS[step.node])
  }
  return pts
}

function outdoorLeg(from: Vec2, to: Vec2): Vec2[] {
  if (segClear(from, to)) return [to]
  const nearest = (p: Vec2): NodeId => {
    let best: NodeId = 'plaza'
    let bd = Infinity
    ;(Object.keys(NODE_POS) as NodeId[]).forEach((n) => {
      const d = Math.hypot(NODE_POS[n][0] - p[0], NODE_POS[n][1] - p[1])
      if (d < bd) { bd = d; best = n }
    })
    return best
  }
  return [...graphPath(nearest(from), nearest(to)), to]
}

export interface LocState {
  pos: Vec2
  floor: number
  building: BuildingId
}

/**
 * The one router (Fase 2): composes interior routing, stair portals, building
 * doors and the outdoor hub graph into a single walked path. Replaces the
 * Fase 1 route() — same call shape for the simulation engine, richer anchors.
 */
export function route(from: LocState, to: Anchor): PathPt[] {
  const raw: PathPt[] = []
  const pushAll = (pts: PathPt[]) => raw.push(...pts)
  let curPos = from.pos
  let curFloor = from.floor
  let curB = from.building
  const targetB = to.building

  if (curB !== 'outdoor' && curB !== targetB) {
    const def = BUILDINGS[curB]
    pushAll(interiorPath(curB, curPos, curFloor, def.doorIn, 0))
    raw.push({ pos: def.doorOut, floor: 0 })
    curPos = def.doorOut
    curFloor = 0
    curB = 'outdoor'
  }

  if (curB === 'outdoor' && targetB !== 'outdoor') {
    const def = BUILDINGS[targetB]
    for (const p of outdoorLeg(curPos, def.doorOut)) raw.push({ pos: p, floor: 0 })
    raw.push({ pos: def.doorIn, floor: 0 })
    pushAll(interiorPath(targetB, def.doorIn, 0, to.pos, to.floor))
  } else if (curB === 'outdoor' && targetB === 'outdoor') {
    for (const p of outdoorLeg(curPos, to.pos)) raw.push({ pos: p, floor: 0 })
  } else if (curB !== 'outdoor') {
    pushAll(interiorPath(curB, curPos, curFloor, to.pos, to.floor))
  }

  // Dedupe consecutive near-identical points — but never merge across a
  // floor change (stair portal endpoints share xz on purpose).
  const out: PathPt[] = []
  for (const p of raw) {
    const last = out[out.length - 1]
    if (!last || last.floor !== p.floor || Math.hypot(last.pos[0] - p.pos[0], last.pos[1] - p.pos[1]) > 0.35) {
      out.push(p)
    }
  }
  return out
}
