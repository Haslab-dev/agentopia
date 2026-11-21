import {
  RES_BENCHES, RES_CENTER, RES_D, RES_DESKS, RES_MAX_X, RES_W,
} from './layout'
import { BoxSet, DeskSet, PlantSet, type Xf } from './instancing'
import { useUiStore } from '../state/stores'
import { useEditorStore } from '../state/editor'

// District(research) → Building(Research) → Floor(L1) → Room(lab).
// Fase 2: a real second building with its own door on the portal graph —
// the Research agent's desk lives here, so inter-building routes run daily.

const WALL = '#f5efe4'
const GLASS = '#bcd9ea'
const H = 3.6
const [rx, rz] = RES_CENTER
const doorHalf = 1.6
const southSegW = (RES_W - doorHalf * 2) / 2

function wallXf(w: number, x: number, z: number, rotY = 0): Xf {
  return { pos: [x, H / 2, z], rotY, scale: [w, H, 0.18] }
}

export function ResearchBuilding() {
  const hideRoof = useUiStore((s) => s.hideRoof)
  const selectBuilding = useUiStore((s) => s.selectBuilding)
  const focusOn = useUiStore((s) => s.focusOn)

  const solid: Xf[] = [
    wallXf(RES_W, rx, rz - RES_D / 2),
    wallXf(RES_D, rx - RES_W / 2, rz, Math.PI / 2),
    wallXf(southSegW, rx - doorHalf - southSegW / 2, rz + RES_D / 2),
    wallXf(southSegW, rx + doorHalf + southSegW / 2, rz + RES_D / 2),
  ]
  const glass: Xf[] = [
    wallXf(RES_D, rx + RES_W / 2, rz, Math.PI / 2),
    wallXf(doorHalf * 2, rx, rz + RES_D / 2),
    { pos: [rx, 2.4, rz - RES_D / 2 + 0.02], scale: [RES_W - 5, 1.1, 0.05] },
  ]
  const benchTops: Xf[] = RES_BENCHES.map(([x, z]) => ({ pos: [x, 0.8, z], scale: [4.4, 0.08, 1.6] as [number, number, number] }))
  const benchLegs: Xf[] = RES_BENCHES.flatMap(([x, z]) =>
    [[-2, -0.65], [2, -0.65], [-2, 0.65], [2, 0.65]].map(([dx, dz]) => ({
      pos: [x + dx, 0.4, z + dz] as [number, number, number],
      scale: [0.08, 0.8, 0.08] as [number, number, number],
    })),
  )
  const racks: Xf[] = [0, 1, 2].map((i) => ({
    pos: [RES_MAX_X - 1.1, 1.1, rz - 5 + i * 2.2],
    scale: [1.1, 2.2, 1.8] as [number, number, number],
  }))

  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        if (useEditorStore.getState().buildMode) return // Phase 6: no camera flights while editing
        selectBuilding('research')
        focusOn([rx, 0, rz])
      }}
    >
      <mesh position={[rx, 0.02, rz]} receiveShadow>
        <boxGeometry args={[RES_W, 0.24, RES_D]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.9} />
      </mesh>
      <BoxSet items={solid} color={WALL} roughness={0.9} receiveShadow />
      <BoxSet items={glass} color={GLASS} roughness={0.1} metalness={0.1} transparent opacity={0.32} castShadow={false} />
      {/* Lab: benches, two research desks, whiteboard, server racks */}
      <BoxSet items={benchTops} color="#e8e2d4" roughness={0.7} />
      <BoxSet items={benchLegs} color="#8a6b4f" castShadow={false} />
      <BoxSet items={racks} color="#3c4a5a" roughness={0.6} />
      <DeskSet spots={RES_DESKS} floor={0} />
      <mesh position={[rx - 4, 1.9, rz - RES_D / 2 + 0.35]}>
        <planeGeometry args={[5.6, 2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </mesh>
      <mesh position={[rx + 5, 1.9, rz - RES_D / 2 + 0.35]}>
        <planeGeometry args={[4.4, 1.8]} />
        <meshStandardMaterial color="#dceefb" emissive="#7fb3e0" emissiveIntensity={0.45} />
      </mesh>
      <PlantSet floor={0} spots={[{ pos: [rx - 10.8, rz + 6.6] }, { pos: [rx + 10.8, rz + 6.6] }]} />
      {!hideRoof && (
        <group>
          <mesh position={[rx, H + 0.3, rz]} castShadow>
            <boxGeometry args={[RES_W + 1.4, 0.3, RES_D + 1.4]} />
            <meshStandardMaterial color="#e5d9c3" roughness={0.85} />
          </mesh>
          <mesh position={[rx - 7, H + 0.75, rz + RES_D / 2 + 0.6]}>
            <boxGeometry args={[5, 0.8, 0.35]} />
            <meshStandardMaterial color="#7fb3e0" emissive="#7fb3e0" emissiveIntensity={0.25} />
          </mesh>
        </group>
      )}
    </group>
  )
}
