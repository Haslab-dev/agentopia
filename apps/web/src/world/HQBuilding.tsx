import {
  CEO_DESK, DESKS, DESKS_L2, floorY, HQ_CENTER, HQ_D, HQ_FLOORS, HQ_MAX_Z, HQ_W,
  LOUNGE_SPOTS, MEETING2_SEATS, MEETING2_TABLE, MEETING_SEATS, MEETING_TABLE,
  PODS, PODS_L3, STAIR_X, STAIR_Z_BOT, STAIR_Z_TOP,
} from './layout'
import {
  BoxSet, ChairSet, DeskSet, LampSet, PlantSet, PodSet, RoundTableSet, SofaSet,
  ZoneGroup, type Xf,
} from './instancing'
import { PendantLamp, WOOD } from './furniture'
import { useUiStore } from '../state/stores'
import { useEditorStore } from '../state/editor'

// Scene graph: District(office) → Building(HQ) → Floor(L1..L4) → Room[] →
// Objects (ARCHITECTURE.md §2.1/§2.2). Fase 2: four floors, floor selection
// hides floors above the selected one; repeated furniture is instanced per
// floor zone (§2.4) — the Fase 1 per-mesh kit is gone from this building.

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

/** Perimeter shell shared by all floors: solid N/W, glass E, door band S. */
function Shell({ level }: { level: number }) {
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
  const parts: Xf[] = [
    partXf(2.6, STAIR_X + 2.2, hz + 4.7, y, Math.PI / 2),
    partXf(3, STAIR_X + 2.2, hz + 9.5, y, Math.PI / 2),
  ]
  return (
    <group>
      <mesh position={[hx, y + 0.02, hz]} receiveShadow>
        <boxGeometry args={[HQ_W, 0.24, HQ_D]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.9} />
      </mesh>
      <BoxSet items={solid} color={WALL} roughness={0.9} receiveShadow />
      <BoxSet items={glass} color={GLASS} roughness={0.1} metalness={0.1} transparent opacity={0.32} castShadow={false} />
      <BoxSet items={parts} color={PART} roughness={0.95} receiveShadow />
    </group>
  )
}

/** Stair flights between consecutive floors (instanced steps, one call). */
function Stairs() {
  const steps: Xf[] = []
  for (let f = 0; f < HQ_FLOORS - 1; f++) {
    for (let i = 0; i < 10; i++) {
      const t = (i + 0.5) / 10
      steps.push({
        pos: [STAIR_X, floorY(f) + t * 3.8, STAIR_Z_BOT + (STAIR_Z_TOP - STAIR_Z_BOT) * t],
        scale: [3.2, 0.38, 0.66],
      })
    }
  }
  // Flights are grouped with the floor they arrive at: viewing floor N shows
  // the flight that leads up to it; floors above the selection hide theirs.
  return (
    <>
      {[1, 2, 3].map((arriveAt) => (
        <ZoneGroup key={arriveAt} zone={{ building: 'hq', floor: arriveAt }}>
          <BoxSet items={steps.filter((_, i) => Math.floor(i / 10) === arriveAt - 1)} color="#ddd3bd" roughness={0.9} />
        </ZoneGroup>
      ))}
    </>
  )
}

function FloorL1() {
  return (
    <ZoneGroup zone={{ building: 'hq', floor: 0 }}>
      <Shell level={0} />
      {/* Meeting room (NE) */}
      <BoxSet items={[partXf(11, hx + 13.5, hz - 4.6, 0), partXf(8.4, hx + 8.1, hz - 8.6, 0, Math.PI / 2)]} color={PART} roughness={0.95} />
      <mesh position={[MEETING_TABLE[0], 0.76, MEETING_TABLE[1]]} castShadow receiveShadow>
        <boxGeometry args={[7.4, 0.1, 3]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
      <mesh position={[MEETING_TABLE[0], 0.38, MEETING_TABLE[1]]}>
        <boxGeometry args={[6.6, 0.76, 2.2]} />
        <meshStandardMaterial color="#8a6b4f" />
      </mesh>
      <ChairSet spots={MEETING_SEATS} floor={0} />
      <mesh position={[MEETING_TABLE[0], 1.9, hz - HQ_D / 2 + 0.35]}>
        <planeGeometry args={[5.4, 2]} />
        <meshStandardMaterial color="#dceefb" emissive="#7fb3e0" emissiveIntensity={0.5} />
      </mesh>
      {/* CEO office (NW) + open workspace — one DeskSet for all 11 desks */}
      <BoxSet items={[partXf(10, hx - 14, hz - 4.6, 0), partXf(8.4, hx - 8.6, hz - 8.6, 0, Math.PI / 2)]} color={PART} roughness={0.95} />
      <DeskSet spots={[...DESKS, CEO_DESK]} floor={0} />
      <SofaSet
        floor={0}
        spots={[
          { pos: [hx - 15.5, hz - 5.6], rotY: Math.PI / 2, color: '#b48ce0' },
          { pos: [hx + 6, HQ_MAX_Z - 3.2], rotY: Math.PI, color: '#7fb3e0' },
        ]}
      />
      <PendantLamp pos={[hx - 6, hz + 1]} />
      <PendantLamp pos={[hx + 4, hz + 1]} />
      {/* Lobby */}
      <mesh position={[hx - 8, 0.55, HQ_MAX_Z - 3.4]} castShadow>
        <boxGeometry args={[5.4, 1.1, 1]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
      <mesh position={[hx - 8, 1.16, HQ_MAX_Z - 3.4]}>
        <boxGeometry args={[5.6, 0.06, 1.2]} />
        <meshStandardMaterial color="#faf6ef" />
      </mesh>
      {/* Focus pods + pantry */}
      <PodSet spots={PODS} floor={0} />
      <mesh position={[hx + 12.5, 0.5, HQ_MAX_Z - 2.2]} castShadow>
        <boxGeometry args={[7, 1, 0.8]} />
        <meshStandardMaterial color="#e8e2d4" roughness={0.8} />
      </mesh>
      <mesh position={[hx + 10.6, 1.35, HQ_MAX_Z - 2.2]}>
        <boxGeometry args={[0.5, 0.7, 0.5]} />
        <meshStandardMaterial color="#f59e4c" />
      </mesh>
      <PlantSet
        floor={0}
        spots={[
          { pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz - 11.4] },
          { pos: [hx - 17.8, hz + 2] }, { pos: [hx + 6, hz - 11.6] },
          { pos: [hx - 13.5, HQ_MAX_Z - 2.6] }, { pos: [hx + 12, HQ_MAX_Z - 2.6] },
          { pos: [hx + 16.8, HQ_MAX_Z - 2], s: 0.8 },
        ]}
      />
    </ZoneGroup>
  )
}

function FloorL2() {
  const y = floorY(1)
  return (
    <ZoneGroup zone={{ building: 'hq', floor: 1 }}>
      <Shell level={1} />
      {/* Two team clusters split by a low partition + whiteboard */}
      <BoxSet items={[partXf(15, hx - 5.5, hz + 0.4, y), partXf(6, hx + 9, hz - 8, y, Math.PI / 2)]} color={PART} roughness={0.95} />
      <mesh position={[hx - 5.5, y + 1.9, hz - HQ_D / 2 + 0.35]}>
        <planeGeometry args={[6, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <DeskSet spots={DESKS_L2} floor={1} />
      <SofaSet spots={[{ pos: [hx + 14.5, hz + 6], rotY: -Math.PI / 2 }]} floor={1} color="#7fb3e0" />
      <RoundTableSet spots={[[hx + 12, hz - 6]]} floor={1} />
      <ChairSet
        floor={1}
        spots={[
          { pos: [hx + 10.6, hz - 6], rotY: Math.PI / 2 },
          { pos: [hx + 13.4, hz - 6], rotY: -Math.PI / 2 },
          { pos: [hx + 12, hz - 7.4], rotY: 0 },
          { pos: [hx + 12, hz - 4.6], rotY: Math.PI },
        ]}
      />
      <LampSet spots={[[hx - 8, hz + 1], [hx + 2, hz + 1], [hx - 8, hz - 7], [hx + 2, hz - 7]]} floor={1} />
      <PlantSet floor={1} spots={[{ pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz + 10.5] }, { pos: [hx + 17.6, hz - 11.6] }]} />
    </ZoneGroup>
  )
}

function FloorL3() {
  const y = floorY(2)
  return (
    <ZoneGroup zone={{ building: 'hq', floor: 2 }}>
      <Shell level={2} />
      {/* Meeting room 2 (NE, mirrors L1) */}
      <BoxSet items={[partXf(11, hx + 13.5, hz - 4.6, y), partXf(8.4, hx + 8.1, hz - 8.6, y, Math.PI / 2)]} color={PART} roughness={0.95} />
      <mesh position={[MEETING2_TABLE[0], y + 0.76, MEETING2_TABLE[1]]} castShadow receiveShadow>
        <boxGeometry args={[7.4, 0.1, 3]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
      <mesh position={[MEETING2_TABLE[0], y + 0.38, MEETING2_TABLE[1]]}>
        <boxGeometry args={[6.6, 0.76, 2.2]} />
        <meshStandardMaterial color="#8a6b4f" />
      </mesh>
      <ChairSet spots={MEETING2_SEATS} floor={2} />
      <mesh position={[MEETING2_TABLE[0], y + 1.9, hz - HQ_D / 2 + 0.35]}>
        <planeGeometry args={[5.4, 2]} />
        <meshStandardMaterial color="#dceefb" emissive="#7fb3e0" emissiveIntensity={0.5} />
      </mesh>
      {/* Focus pods (W) + breakout sofa */}
      <PodSet spots={PODS_L3} floor={2} />
      <SofaSet spots={[{ pos: [hx - 12, hz + 7.5], rotY: Math.PI }]} floor={2} color="#e8b08a" />
      <LampSet spots={[[hx - 4, hz + 1], [hx + 6, hz + 1]]} floor={2} />
      <PlantSet floor={2} spots={[{ pos: [hx + 17.6, hz - 11.4] }, { pos: [hx - 17.8, hz + 11] }]} />
    </ZoneGroup>
  )
}

function FloorL4() {
  const y = floorY(3)
  return (
    <ZoneGroup zone={{ building: 'hq', floor: 3 }}>
      <Shell level={3} />
      {/* Lounge: sofas, round tables, kitchen counter along the north wall */}
      <SofaSet
        floor={3}
        color="#e8b08a"
        spots={[
          { pos: [hx - 12, hz - 2.6], rotY: 0 },
          { pos: [hx + 2, hz + 7.6], rotY: Math.PI },
          { pos: [hx + 14.5, hz - 2], rotY: -Math.PI / 2 },
        ]}
      />
      <RoundTableSet floor={3} spots={[[hx - 8, hz + 0.8], [hx + 3, hz + 0.8], [hx + 10, hz + 6.8], [hx - 12, hz + 6.8]]} />
      <ChairSet
        floor={3}
        spots={LOUNGE_SPOTS.slice(0, 6).map((s) => ({ pos: s.pos, rotY: s.rotY }))}
      />
      <BoxSet
        items={[
          { pos: [hx - 4, y + 0.5, hz - 11.6], scale: [12, 1, 0.8] },
          { pos: [hx - 7.5, y + 1.35, hz - 11.6], scale: [0.5, 0.7, 0.5] },
        ]}
        color="#e8e2d4"
        roughness={0.8}
      />
      <LampSet spots={[[hx - 8, hz + 1], [hx + 2, hz + 1], [hx - 8, hz + 7], [hx + 6, hz + 7]]} floor={3} />
      <PlantSet
        floor={3}
        spots={[
          { pos: [hx - 17.8, hz - 12] }, { pos: [hx + 17.6, hz - 12] },
          { pos: [hx - 17.8, hz + 11] }, { pos: [hx + 17.6, hz + 11] },
        ]}
      />
    </ZoneGroup>
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
      <FloorL1 />
      <FloorL2 />
      <FloorL3 />
      <FloorL4 />
      <Stairs />
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
