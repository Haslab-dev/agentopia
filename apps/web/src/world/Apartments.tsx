import {
  APT_CENTER, APT_D, APT_FLOORS, APT_MAX_X, APT_MIN_X, APT_MIN_Z, APT_MAX_Z,
  APT_PART_Z, APT_ROOM_XS, APT_STAIR_BOT, APT_STAIR_TOP, APT_STAIR_X,
  floorY, homeBedCenter,
} from './layout'
import { BedSet, BoxSet, PlantSet, RoundTableSet, SofaSet, ZoneGroup, type Xf } from './instancing'
import { useUiStore } from '../state/stores'
import { useEditorStore } from '../state/editor'

// District(residential) → Building(Apartments) → Floor(L1,L2) → Room(×5).
// Fase 2: one room per agent (10). Agents walk home through the portal graph
// at the rest block / agent.offline — no teleporting (§2.3).

const WALL = '#f7f1e6'
const GLASS = '#bcd9ea'
const PART = '#efe6d4'
const H = 3.6
const [ax, az] = APT_CENTER
const doorX = ax - 10
const doorHalf = 1.5

function wallXf(w: number, x: number, z: number, y: number, rotY = 0): Xf {
  return { pos: [x, y + H / 2, z], rotY, scale: [w, H, 0.18] }
}
function partXf(w: number, x: number, z: number, y: number, rotY = 0): Xf {
  return { pos: [x, y + 1.4, z], rotY, scale: [w, 2.8, 0.1] }
}

function partitions(y: number): Xf[] {
  const out: Xf[] = []
  // Room/corridor wall with a door gap per room.
  let cursor = APT_MIN_X
  for (const cx of APT_ROOM_XS) {
    const gapL = cx - 0.7
    if (gapL > cursor) out.push(partXf(gapL - cursor, (cursor + gapL) / 2, APT_PART_Z, y))
    cursor = cx + 0.7
  }
  // East of the last room the stair bay begins — its west wall closes the row.
  if (APT_STAIR_X - 1.3 > cursor) out.push(partXf(APT_STAIR_X - 1.3 - cursor, (cursor + APT_STAIR_X - 1.3) / 2, APT_PART_Z, y))
  // Room dividers.
  for (let i = 0; i < 4; i++) {
    const x = APT_ROOM_XS[i] + 2.6
    out.push(partXf(APT_PART_Z - APT_MIN_Z, x, (APT_MIN_Z + APT_PART_Z) / 2, y, Math.PI / 2))
  }
  // Stair-bay west wall, with the entry gap the approach path walks through.
  out.push(partXf(4.6, APT_STAIR_X - 2.6, APT_MIN_Z + 2.3, y, Math.PI / 2))
  out.push(partXf(2.2, APT_STAIR_X - 2.6, APT_MAX_Z - 1.1, y, Math.PI / 2))
  return out
}

function AptFloor({ level }: { level: number }) {
  const y = floorY(level)
  const southL = doorX - doorHalf - APT_MIN_X
  const southR = APT_MAX_X - (doorX + doorHalf)
  const solid: Xf[] = [
    wallXf(APT_MAX_X - APT_MIN_X, ax, APT_MIN_Z, y),
    wallXf(APT_D, APT_MIN_X, az, y, Math.PI / 2),
    wallXf(APT_D, APT_MAX_X, az, y, Math.PI / 2),
    wallXf(southL, APT_MIN_X + southL / 2, APT_MAX_Z, y),
    wallXf(southR, doorX + doorHalf + southR / 2, APT_MAX_Z, y),
  ]
  const glass: Xf[] = [
    wallXf(doorHalf * 2, doorX, APT_MAX_Z, y),
    { pos: [ax + 4, y + 2.4, APT_MIN_Z + 0.02], scale: [16, 1.1, 0.05] },
  ]
  const beds = [0, 1, 2, 3, 4].map((r) => {
    const c = homeBedCenter(level * 5 + r)
    return { pos: c.pos, rotY: 0 }
  })
  const sideTables: Xf[] = APT_ROOM_XS.map((cx) => ({
    pos: [cx + 1.15, y + 0.25, az - 4.6],
    scale: [0.5, 0.5, 0.4] as [number, number, number],
  }))
  return (
    <ZoneGroup zone={{ building: 'apartment', floor: level }}>
      <mesh position={[ax, y + 0.02, az]} receiveShadow>
        <boxGeometry args={[APT_MAX_X - APT_MIN_X, 0.24, APT_D]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.9} />
      </mesh>
      <BoxSet items={solid} color={WALL} roughness={0.9} receiveShadow />
      <BoxSet items={glass} color={GLASS} roughness={0.1} metalness={0.1} transparent opacity={0.32} castShadow={false} />
      <BoxSet items={partitions(y)} color={PART} roughness={0.95} />
      <BedSet spots={beds} floor={level} />
      <BoxSet items={sideTables} color="#b08968" castShadow={false} />
      {/* Common area (south band): sofa + table */}
      <SofaSet spots={[{ pos: [ax + 3, az + 3.6], rotY: Math.PI }]} floor={level} color="#9db38a" />
      <RoundTableSet spots={[[ax - 3.5, az + 3.4]]} floor={level} />
      <PlantSet floor={level} spots={[{ pos: [ax - 13.8, az + 4.6] }, { pos: [ax + 7.5, az + 4.6] }]} />
    </ZoneGroup>
  )
}

function AptStairs() {
  const steps: Xf[] = []
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.5) / 10
    steps.push({
      pos: [APT_STAIR_X, t * 3.8, APT_STAIR_BOT[1] + (APT_STAIR_TOP[1] - APT_STAIR_BOT[1]) * t],
      scale: [3, 0.38, 0.66],
    })
  }
  return (
    <ZoneGroup zone={{ building: 'apartment', floor: 1 }}>
      <BoxSet items={steps} color="#ddd3bd" roughness={0.9} />
    </ZoneGroup>
  )
}

export function Apartments() {
  const hideRoof = useUiStore((s) => s.hideRoof)
  const selectBuilding = useUiStore((s) => s.selectBuilding)
  const focusOn = useUiStore((s) => s.focusOn)
  const roofY = floorY(APT_FLOORS - 1)
  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        if (useEditorStore.getState().buildMode) return // Phase 6: no camera flights while editing
        selectBuilding('apartment')
        focusOn([ax, 0, az])
      }}
    >
      <AptFloor level={0} />
      <AptFloor level={1} />
      <AptStairs />
      {!hideRoof && (
        <group>
          <mesh position={[ax, roofY + H + 0.3, az]} castShadow>
            <boxGeometry args={[APT_MAX_X - APT_MIN_X + 1.4, 0.3, APT_D + 1.4]} />
            <meshStandardMaterial color="#e5d9c3" roughness={0.85} />
          </mesh>
          <mesh position={[ax + 8, roofY + H + 0.72, APT_MAX_Z + 0.6]}>
            <boxGeometry args={[5.4, 0.8, 0.35]} />
            <meshStandardMaterial color="#9db38a" emissive="#9db38a" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )}
    </group>
  )
}
