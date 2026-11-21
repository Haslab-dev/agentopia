import {
  CEO_DESK, DESKS, DESKS_L2, floorY, HQ_CENTER, HQ_D, HQ_FLOORS, HQ_MAX_Z, HQ_W,
  LOUNGE_SPOTS, MEETING2_SEATS, MEETING2_TABLE, MEETING_SEATS, MEETING_TABLE,
  PODS, PODS_L3, STAIR_X, STAIR_Z_BOT, STAIR_Z_TOP,
} from './layout'
import {
  BoxSet, BoxSetCapped, InstancedCapped, UNIT_BOX, ZoneGroup,
  chairItems, deskItems, lampItems, plantItems, podItems, roundTableItems, sofaItems,
  type Xf,
} from './instancing'
import { PendantLamp, WOOD } from './furniture'
import { useUiStore } from '../state/stores'
import { useEditorStore } from '../state/editor'

// Scene graph: District(office) → Building(HQ) → Floor(L1..L4) → Room[] →
// Objects (ARCHITECTURE.md §2.1/§2.2). Fase 2: four floors, floor selection
// hides floors above the selected one; repeated furniture is instanced per
// floor zone (§2.4) — the Fase 1 per-mesh kit is gone from this building.
//
// Fase 7: the per-floor instanced sets are merged across floors
// (InstancedCapped — one InstancedMesh per part type, instances ordered by
// floor, `count` capped to the selected floor's prefix). Visibility matches
// the old ZoneGroup rule exactly; only one-off meshes (pendant lights,
// counters, whiteboard) still live in per-floor ZoneGroups.

const WALL = '#f5efe4'
const GLASS = '#bcd9ea'
const PART = '#efe6d4'
const H = 3.6

const [hx, hz] = HQ_CENTER
const doorHalf = 2.2
const southSegW = (HQ_W - doorHalf * 2) / 2

function wallXf(w: number, x: number, z: number, y: number, rotY = 0): Xf {
  return { pos: [x, y + H / 2, z], rotY, scale: [w, H, 0.18] }
}
function partXf(w: number, x: number, z: number, y: number, rotY = 0): Xf {
  return { pos: [x, y + 1.5, z], rotY, scale: [w, 3, 0.1] }
}

interface ShellItems { slab: Xf[]; solid: Xf[]; glass: Xf[]; stairParts: Xf[]; roomParts: Xf[] }

/** Perimeter shell + partitions of one floor, as item arrays (Fase 7:
    merged across floors by HQMergedShells). */
function shellItems(level: number): ShellItems {
  const y = floorY(level)
  const solid: Xf[] = [
    wallXf(HQ_W, hx, hz - HQ_D / 2, y),
    wallXf(HQ_D, hx - HQ_W / 2, hz, y, Math.PI / 2),
    wallXf(southSegW, hx - doorHalf - southSegW / 2, hz + HQ_D / 2, y),
    wallXf(southSegW, hx + doorHalf + southSegW / 2, hz + HQ_D / 2, y),
  ]
  const glass: Xf[] = [
    wallXf(HQ_D, hx + HQ_W / 2, hz, y, Math.PI / 2),
    wallXf(doorHalf * 2, hx, hz + HQ_D / 2, y),
    { pos: [hx, y + 2.4, hz - HQ_D / 2 + 0.02], scale: [HQ_W - 6, 1.1, 0.05] },
  ]
  // Stair-bay partition (east side of the west stairwell), gap at the approach.
  const stairParts: Xf[] = [
    partXf(2.6, STAIR_X + 2.2, hz + 4.7, y, Math.PI / 2),
    partXf(3, STAIR_X + 2.2, hz + 9.5, y, Math.PI / 2),
  ]
  const roomParts: Xf[] =
    level === 0
      ? [partXf(11, hx + 13.5, hz - 4.6, y), partXf(8.4, hx + 8.1, hz - 8.6, y, Math.PI / 2),
         partXf(10, hx - 14, hz - 4.6, y), partXf(8.4, hx - 8.6, hz - 8.6, y, Math.PI / 2)]
      : level === 1
        ? [partXf(15, hx - 5.5, hz + 0.4, y), partXf(6, hx + 9, hz - 8, y, Math.PI / 2)]
        : level === 2
          ? [partXf(11, hx + 13.5, hz - 4.6, y), partXf(8.4, hx + 8.1, hz - 8.6, y, Math.PI / 2)]
          : []
  return {
    slab: [{ pos: [hx, y + 0.02, hz], scale: [HQ_W, 0.24, HQ_D] }],
    solid, glass, stairParts, roomParts,
  }
}

const SHELLS = [0, 1, 2, 3].map(shellItems)

/** Stair flights grouped by the floor they arrive at (index = floor). */
const STAIR_FLIGHTS: Xf[][] = (() => {
  const flights: Xf[][] = [[], [], [], []]
  for (let f = 0; f < HQ_FLOORS - 1; f++) {
    for (let i = 0; i < 10; i++) {
      const t = (i + 0.5) / 10
      flights[f + 1].push({
        pos: [STAIR_X, floorY(f) + t * 3.8, STAIR_Z_BOT + (STAIR_Z_TOP - STAIR_Z_BOT) * t],
        scale: [3.2, 0.38, 0.66],
      })
    }
  }
  return flights
})()

// ── Per-floor furniture spot lists (the Fase 2 layout, unchanged) ───────────

const PLANTS: { pos: [number, number]; s?: number }[][] = [
  [
    { pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz - 11.4] },
    { pos: [hx - 17.8, hz + 2] }, { pos: [hx + 6, hz - 11.6] },
    { pos: [hx - 13.5, HQ_MAX_Z - 2.6] }, { pos: [hx + 12, HQ_MAX_Z - 2.6] },
    { pos: [hx + 16.8, HQ_MAX_Z - 2], s: 0.8 },
  ],
  [{ pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz + 10.5] }, { pos: [hx + 17.6, hz - 11.6] }],
  [{ pos: [hx + 17.6, hz - 11.4] }, { pos: [hx - 17.8, hz + 11] }],
  [
    { pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz - 12] },
    { pos: [hx - 17.8, hz + 11] }, { pos: [hx + 17.6, hz + 11] },
  ],
]

const SOFAS = [
  sofaItems([
    { pos: [hx - 15.5, hz - 5.6], rotY: Math.PI / 2, color: '#b48ce0' },
    { pos: [hx + 6, HQ_MAX_Z - 3.2], rotY: Math.PI, color: '#7fb3e0' },
  ], 0),
  sofaItems([{ pos: [hx + 14.5, hz + 6], rotY: -Math.PI / 2, color: '#7fb3e0' }], 1),
  sofaItems([{ pos: [hx - 12, hz + 7.5], rotY: Math.PI, color: '#e8b08a' }], 2),
  sofaItems([
    { pos: [hx - 12, hz - 2.6], rotY: 0, color: '#e8b08a' },
    { pos: [hx + 2, hz + 7.6], rotY: Math.PI, color: '#e8b08a' },
    { pos: [hx + 14.5, hz - 2], rotY: -Math.PI / 2, color: '#e8b08a' },
  ], 3),
]

const LAMPS = [
  lampItems([], 0),
  lampItems([[hx - 8, hz + 1], [hx + 2, hz + 1], [hx - 8, hz - 7], [hx + 2, hz - 7]], 1),
  lampItems([[hx - 4, hz + 1], [hx + 6, hz + 1]], 2),
  lampItems([[hx - 8, hz + 1], [hx + 2, hz + 1], [hx - 8, hz + 7], [hx + 6, hz + 7]], 3),
]

const CHAIRS = [
  chairItems(MEETING_SEATS, 0),
  chairItems([
    { pos: [hx + 10.6, hz - 6], rotY: Math.PI / 2 },
    { pos: [hx + 13.4, hz - 6], rotY: -Math.PI / 2 },
    { pos: [hx + 12, hz - 7.4], rotY: 0 },
    { pos: [hx + 12, hz - 4.6], rotY: Math.PI },
  ], 1),
  chairItems(MEETING2_SEATS, 2),
  chairItems(LOUNGE_SPOTS.slice(0, 6).map((s) => ({ pos: s.pos, rotY: s.rotY })), 3),
]

const DESK_SETS = [deskItems([...DESKS, CEO_DESK], 0), deskItems(DESKS_L2, 1), deskItems([], 2), deskItems([], 3)]
const PLANT_SETS = PLANTS.map((spots, f) => plantItems(spots, f))
const POD_SETS = [podItems(PODS, 0), podItems([], 1), podItems(PODS_L3, 2), podItems([], 3)]
const TABLES = [
  roundTableItems([], 0),
  roundTableItems([[hx + 12, hz - 6]], 1),
  roundTableItems([], 2),
  roundTableItems([[hx - 8, hz + 0.8], [hx + 3, hz + 0.8], [hx + 10, hz + 6.8], [hx - 12, hz + 6.8]], 3),
]

/** Meeting-room tables + screens of L1/L3 as capped box/plane sets. */
const MEETING_TOPS: Xf[][] = [
  [{ pos: [MEETING_TABLE[0], 0.76, MEETING_TABLE[1]], scale: [7.4, 0.1, 3] }],
  [],
  [{ pos: [MEETING2_TABLE[0], floorY(2) + 0.76, MEETING2_TABLE[1]], scale: [7.4, 0.1, 3] }],
  [],
]
const MEETING_BASES: Xf[][] = [
  [{ pos: [MEETING_TABLE[0], 0.38, MEETING_TABLE[1]], scale: [6.6, 0.76, 2.2] }],
  [],
  [{ pos: [MEETING2_TABLE[0], floorY(2) + 0.38, MEETING2_TABLE[1]], scale: [6.6, 0.76, 2.2] }],
  [],
]
const MEETING_SCREENS: Xf[][] = [
  [{ pos: [MEETING_TABLE[0], 1.9, hz - HQ_D / 2 + 0.35], scale: [5.4, 2, 1] }],
  [],
  [{ pos: [MEETING2_TABLE[0], floorY(2) + 1.9, hz - HQ_D / 2 + 0.35], scale: [5.4, 2, 1] }],
  [],
]

const flatColors = (perFloor: (string[] | undefined)[]) => perFloor.flatMap((c) => c ?? [])

/** All repeated HQ furniture, merged across floors (Fase 7). One draw call
    per part type per shadow pass, however many floors are shown. */
function HQMergedSets() {
  return (
    <group>
      {/* Shells */}
      <BoxSetCapped floorsItems={SHELLS.map((s) => s.slab)} color="#e9dfca" roughness={0.9} receiveShadow castShadow={false} />
      <BoxSetCapped floorsItems={SHELLS.map((s) => s.solid)} color={WALL} roughness={0.9} receiveShadow />
      <BoxSetCapped floorsItems={SHELLS.map((s) => s.glass)} color={GLASS} roughness={0.1} metalness={0.1} transparent opacity={0.32} castShadow={false} />
      <BoxSetCapped floorsItems={SHELLS.map((s) => s.stairParts)} color={PART} roughness={0.95} receiveShadow />
      <BoxSetCapped floorsItems={SHELLS.map((s) => s.roomParts)} color={PART} roughness={0.95} />
      {/* Stairs */}
      <BoxSetCapped floorsItems={STAIR_FLIGHTS} color="#ddd3bd" roughness={0.9} />
      {/* Desks (L1 + L2) */}
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.tops)} geometry={UNIT_BOX} color={WOOD} roughness={0.7} />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.legs)} geometry={UNIT_BOX} color="#8a6b4f" castShadow={false} />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.monitors)} geometry={UNIT_BOX} color="#2c2a26" castShadow={false} />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.screens)} geometry={<planeGeometry args={[1, 1]} />} color="#a8d8f0" emissive="#6db3dd" emissiveIntensity={0.55} castShadow={false} />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.keyboards)} geometry={UNIT_BOX} color="#e8e2d4" castShadow={false} />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.seats)} geometry={UNIT_BOX} color="#7d8ca3" />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.backs)} geometry={UNIT_BOX} color="#7d8ca3" />
      <InstancedCapped floorsItems={DESK_SETS.map((d) => d.posts)} geometry={<cylinderGeometry args={[0.5, 0.5, 1, 8]} />} color="#55524c" castShadow={false} />
      {/* Chairs */}
      <InstancedCapped floorsItems={CHAIRS.map((c) => c.seats)} geometry={UNIT_BOX} color="#7d8ca3" />
      <InstancedCapped floorsItems={CHAIRS.map((c) => c.backs)} geometry={UNIT_BOX} color="#7d8ca3" />
      {/* Plants */}
      <InstancedCapped floorsItems={PLANT_SETS.map((p) => p.pots)} geometry={<cylinderGeometry args={[0.22, 0.17, 0.5, 10]} />} color="#c96f4a" roughness={0.85} />
      <InstancedCapped floorsItems={PLANT_SETS.map((p) => p.leafA)} geometry={<icosahedronGeometry args={[0.42, 1]} />} color="#5f9e6e" flatShading />
      <InstancedCapped floorsItems={PLANT_SETS.map((p) => p.leafB)} geometry={<icosahedronGeometry args={[0.26, 1]} />} color="#6fae7d" flatShading />
      {/* Sofas (per-instance colours, concatenated in floor order) */}
      <InstancedCapped floorsItems={SOFAS.map((s) => s.bases)} geometry={UNIT_BOX} color="#ffffff" colors={flatColors(SOFAS.map((s) => s.colors))} roughness={0.95} />
      <InstancedCapped floorsItems={SOFAS.map((s) => s.backs)} geometry={UNIT_BOX} color="#ffffff" colors={flatColors(SOFAS.map((s) => s.colors))} roughness={0.95} />
      <InstancedCapped floorsItems={SOFAS.map((s) => s.arms)} geometry={UNIT_BOX} color="#ffffff" colors={flatColors(SOFAS.map((s) => s.armColors))} roughness={0.95} />
      {/* Lamps */}
      <InstancedCapped floorsItems={LAMPS.map((l) => l.cords)} geometry={<cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />} color="#55524c" castShadow={false} />
      <InstancedCapped floorsItems={LAMPS.map((l) => l.shades)} geometry={<coneGeometry args={[0.32, 0.28, 12, 1, true]} />} color="#f59e4c" castShadow={false} />
      {/* Focus pods (L1 + L3) */}
      <InstancedCapped floorsItems={POD_SETS.map((p) => p.shells)} geometry={UNIT_BOX} color="#efe6d4" />
      <InstancedCapped floorsItems={POD_SETS.map((p) => p.glass)} geometry={UNIT_BOX} color="#bcd9ea" transparent opacity={0.45} roughness={0.1} castShadow={false} />
      <InstancedCapped floorsItems={POD_SETS.map((p) => p.tops)} geometry={UNIT_BOX} color={WOOD} castShadow={false} />
      {/* Round tables (L2 + L4) */}
      <InstancedCapped floorsItems={TABLES.map((t) => t.tops)} geometry={<cylinderGeometry args={[0.85, 0.85, 0.06, 14]} />} color="#f5efe4" />
      <InstancedCapped floorsItems={TABLES.map((t) => t.posts)} geometry={<cylinderGeometry args={[0.06, 0.06, 0.75, 8]} />} color="#55524c" castShadow={false} />
      {/* Meeting tables + screens (L1 + L3) */}
      <BoxSetCapped floorsItems={MEETING_TOPS} color={WOOD} roughness={0.6} receiveShadow />
      <BoxSetCapped floorsItems={MEETING_BASES} color="#8a6b4f" roughness={1} />
      <InstancedCapped floorsItems={MEETING_SCREENS} geometry={<planeGeometry args={[1, 1]} />} color="#dceefb" emissive="#7fb3e0" emissiveIntensity={0.5} castShadow={false} />
    </group>
  )
}

/** One-off pieces that stay per-floor (lights, counters, whiteboard). */
function FloorExtras() {
  const y3 = floorY(3)
  return (
    <>
      <ZoneGroup zone={{ building: 'hq', floor: 0 }}>
        <PendantLamp pos={[hx - 6, hz + 1]} />
        <PendantLamp pos={[hx + 4, hz + 1]} />
        {/* Lobby reception counter */}
        <mesh position={[hx - 8, 0.55, HQ_MAX_Z - 3.4]} castShadow>
          <boxGeometry args={[5.4, 1.1, 1]} />
          <meshStandardMaterial color={WOOD} roughness={0.6} />
        </mesh>
        <mesh position={[hx - 8, 1.16, HQ_MAX_Z - 3.4]}>
          <boxGeometry args={[5.6, 0.06, 1.2]} />
          <meshStandardMaterial color="#faf6ef" />
        </mesh>
        {/* Pantry counter + coffee machine */}
        <mesh position={[hx + 12.5, 0.5, HQ_MAX_Z - 2.2]} castShadow>
          <boxGeometry args={[7, 1, 0.8]} />
          <meshStandardMaterial color="#e8e2d4" roughness={0.8} />
        </mesh>
        <mesh position={[hx + 10.6, 1.35, HQ_MAX_Z - 2.2]}>
          <boxGeometry args={[0.5, 0.7, 0.5]} />
          <meshStandardMaterial color="#f59e4c" />
        </mesh>
      </ZoneGroup>
      <ZoneGroup zone={{ building: 'hq', floor: 1 }}>
        {/* L2 whiteboard */}
        <mesh position={[hx - 5.5, floorY(1) + 1.9, hz - HQ_D / 2 + 0.35]}>
          <planeGeometry args={[6, 2]} />
          <meshStandardMaterial color="#ffffff" roughness={0.6} />
        </mesh>
      </ZoneGroup>
      <ZoneGroup zone={{ building: 'hq', floor: 3 }}>
        {/* L4 kitchen counter */}
        <BoxSet
          items={[
            { pos: [hx - 4, y3 + 0.5, hz - 11.6], scale: [12, 1, 0.8] },
            { pos: [hx - 7.5, y3 + 1.35, hz - 11.6], scale: [0.5, 0.7, 0.5] },
          ]}
          color="#e8e2d4"
          roughness={0.8}
        />
      </ZoneGroup>
    </>
  )
}

export function HQBuilding() {
  const hideRoof = useUiStore((s) => s.hideRoof)
  const hqFloor = useUiStore((s) => s.hqFloor)
  const selectBuilding = useUiStore((s) => s.selectBuilding)
  const focusOn = useUiStore((s) => s.focusOn)
  const showRoof = hqFloor === 'all' && !hideRoof
  const roofY = floorY(HQ_FLOORS - 1)

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        if (useEditorStore.getState().buildMode) return // Phase 6: no camera flights while editing
        selectBuilding('hq')
        focusOn([hx, hqFloor === 'all' ? 0 : floorY(hqFloor), hz])
      }}
    >
      <HQMergedSets />
      <FloorExtras />
      {/* Roof (occluder) — only in All-floors view; a selected floor is
          viewed open, per §2.2. */}
      {showRoof && (
        <group>
          <mesh position={[hx, roofY + H + 0.35, hz]} castShadow>
            <boxGeometry args={[HQ_W + 1.6, 0.3, HQ_D + 1.6]} />
            <meshStandardMaterial color="#e5d9c3" roughness={0.85} />
          </mesh>
          <mesh position={[hx, roofY + H + 0.62, hz]}>
            <boxGeometry args={[10, 0.25, 7]} />
            <meshStandardMaterial color="#d9cbae" />
          </mesh>
          <mesh position={[hx - 12, roofY + H + 0.85, hz + HQ_D / 2 + 0.6]}>
            <boxGeometry args={[6, 0.9, 0.4]} />
            <meshStandardMaterial color="#f59e4c" emissive="#f59e4c" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )}
    </group>
  )
}
