import {
  APT_CENTER, APT_D, APT_FLOORS, APT_MAX_X, APT_MIN_X, APT_MIN_Z, APT_MAX_Z,
  APT_PART_Z, APT_ROOM_XS, APT_STAIR_BOT, APT_STAIR_TOP, APT_STAIR_X,
  floorY, homeBedCenter,
} from './layout'
import {
  BoxSet, Instanced, UNIT_BOX, ZoneGroup,
  bedItems, plantItems, roundTableItems, sofaItems, type Xf,
} from './instancing'
import { useUiStore } from '../state/stores'
import { useEditorStore } from '../state/editor'

// District(residential) → Building(Apartments) → Floor(L1,L2) → Room(×5).
// Fase 2: one room per agent (10). Agents walk home through the portal graph
// at the rest block / agent.offline — no teleporting (§2.3).
//
// Fase 7: both floors are always visible (zoneVisible is true for every
// non-HQ building), so their instanced sets are merged by plain
// concatenation — one InstancedMesh per part type for the whole building.

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

interface FloorItems {
  slab: Xf[]; solid: Xf[]; glass: Xf[]; parts: Xf[]; sideTables: Xf[]
  beds: ReturnType<typeof bedItems>; sofas: ReturnType<typeof sofaItems>
  tables: ReturnType<typeof roundTableItems>; plants: ReturnType<typeof plantItems>
}

function floorItems(level: number): FloorItems {
  const y = floorY(level)
  const southL = doorX - doorHalf - APT_MIN_X
  const southR = APT_MAX_X - (doorX + doorHalf)
  const beds = [0, 1, 2, 3, 4].map((r) => {
    const c = homeBedCenter(level * 5 + r)
    return { pos: c.pos, rotY: 0 }
  })
  return {
    slab: [{ pos: [ax, y + 0.02, az], scale: [APT_MAX_X - APT_MIN_X, 0.24, APT_D] }],
    solid: [
      wallXf(APT_MAX_X - APT_MIN_X, ax, APT_MIN_Z, y),
      wallXf(APT_D, APT_MIN_X, az, y, Math.PI / 2),
      wallXf(APT_D, APT_MAX_X, az, y, Math.PI / 2),
      wallXf(southL, APT_MIN_X + southL / 2, APT_MAX_Z, y),
      wallXf(southR, doorX + doorHalf + southR / 2, APT_MAX_Z, y),
    ],
    glass: [
      wallXf(doorHalf * 2, doorX, APT_MAX_Z, y),
      { pos: [ax + 4, y + 2.4, APT_MIN_Z + 0.02], scale: [16, 1.1, 0.05] },
    ],
    parts: partitions(y),
    sideTables: APT_ROOM_XS.map((cx) => ({
      pos: [cx + 1.15, y + 0.25, az - 4.6] as [number, number, number],
      scale: [0.5, 0.5, 0.4] as [number, number, number],
    })),
    beds: bedItems(beds, level),
    sofas: sofaItems([{ pos: [ax + 3, az + 3.6], rotY: Math.PI }], level, '#9db38a'),
    tables: roundTableItems([[ax - 3.5, az + 3.4]], level),
    plants: plantItems([{ pos: [ax - 13.8, az + 4.6] }, { pos: [ax + 7.5, az + 4.6] }], level),
  }
}

const F0 = floorItems(0)
const F1 = floorItems(1)
const cat = (a: Xf[], b: Xf[]) => [...a, ...b]

function AptMerged() {
  return (
    <group>
      <BoxSet items={cat(F0.slab, F1.slab)} color="#e9dfca" roughness={0.9} receiveShadow castShadow={false} />
      <BoxSet items={cat(F0.solid, F1.solid)} color={WALL} roughness={0.9} receiveShadow />
      <BoxSet items={cat(F0.glass, F1.glass)} color={GLASS} roughness={0.1} metalness={0.1} transparent opacity={0.32} castShadow={false} />
      <BoxSet items={cat(F0.parts, F1.parts)} color={PART} roughness={0.95} />
      <Instanced items={cat(F0.beds.frames, F1.beds.frames)} geometry={UNIT_BOX} color="#8a6b4f" />
      <Instanced items={cat(F0.beds.mattresses, F1.beds.mattresses)} geometry={UNIT_BOX} color="#f5efe4" roughness={0.95} />
      <Instanced items={cat(F0.beds.pillows, F1.beds.pillows)} geometry={UNIT_BOX} color="#dceefb" roughness={0.95} castShadow={false} />
      <BoxSet items={cat(F0.sideTables, F1.sideTables)} color="#b08968" castShadow={false} />
      <Instanced items={cat(F0.sofas.bases, F1.sofas.bases)} geometry={UNIT_BOX} color="#9db38a" roughness={0.95} />
      <Instanced items={cat(F0.sofas.backs, F1.sofas.backs)} geometry={UNIT_BOX} color="#9db38a" roughness={0.95} />
      <Instanced items={cat(F0.sofas.arms, F1.sofas.arms)} geometry={UNIT_BOX} color="#9db38a" roughness={0.95} />
      <Instanced items={cat(F0.tables.tops, F1.tables.tops)} geometry={<cylinderGeometry args={[0.85, 0.85, 0.06, 14]} />} color="#f5efe4" />
      <Instanced items={cat(F0.tables.posts, F1.tables.posts)} geometry={<cylinderGeometry args={[0.06, 0.06, 0.75, 8]} />} color="#55524c" castShadow={false} />
      <Instanced items={cat(F0.plants.pots, F1.plants.pots)} geometry={<cylinderGeometry args={[0.22, 0.17, 0.5, 10]} />} color="#c96f4a" roughness={0.85} />
      <Instanced items={cat(F0.plants.leafA, F1.plants.leafA)} geometry={<icosahedronGeometry args={[0.42, 1]} />} color="#5f9e6e" flatShading />
      <Instanced items={cat(F0.plants.leafB, F1.plants.leafB)} geometry={<icosahedronGeometry args={[0.26, 1]} />} color="#6fae7d" flatShading />
    </group>
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
      <AptMerged />
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
