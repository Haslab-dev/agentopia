import { useLayoutEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useUiStore } from '../state/stores'
import { floorY, type DeskSpot, type Vec2 } from './layout'
import type { BuildingId } from '../state/agentRuntime'

// ─────────────────────────────────────────────────────────────────────────────
// Instancing layer (ARCHITECTURE.md §2.4): repeated kit parts render as ONE
// InstancedMesh per part type per zone — this is what brings the static
// campus under the <150 draw-call budget. A "zone" is one floor of one
// building (or the outdoors); zone visibility follows the HQ floor selector.
// ─────────────────────────────────────────────────────────────────────────────

export interface Zone {
  building: BuildingId
  floor: number
}

export function zoneVisible(building: BuildingId, floor: number, hqFloor: number | 'all'): boolean {
  if (building !== 'hq') return true
  return hqFloor === 'all' || floor <= hqFloor
}

export function ZoneGroup({ zone, children }: { zone: Zone; children: ReactNode }) {
  const visible = useUiStore((s) => zoneVisible(zone.building, zone.floor, s.hqFloor))
  return <group visible={visible}>{children}</group>
}

export interface Xf {
  pos: [number, number, number]
  rotY?: number
  rotX?: number
  scale?: [number, number, number]
}

interface InstancedProps {
  items: Xf[]
  geometry: ReactNode
  color: string
  /** Optional per-instance colours (material colour should stay white). */
  colors?: string[]
  roughness?: number
  metalness?: number
  flatShading?: boolean
  transparent?: boolean
  opacity?: number
  emissive?: string
  emissiveIntensity?: number
  castShadow?: boolean
  receiveShadow?: boolean
}

/** One draw call for N copies of a part. Geometry is supplied as a child
    (e.g. <boxGeometry args={[1,1,1]} />) and scaled per instance. */
export function Instanced({ items, geometry, colors, castShadow = true, receiveShadow = false, ...mat }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    if (!ref.current || items.length === 0) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const col = new THREE.Color()
    items.forEach((it, i) => {
      e.set(it.rotX ?? 0, it.rotY ?? 0, 0)
      q.setFromEuler(e)
      m.compose(
        new THREE.Vector3(it.pos[0], it.pos[1], it.pos[2]),
        q,
        new THREE.Vector3(it.scale?.[0] ?? 1, it.scale?.[1] ?? 1, it.scale?.[2] ?? 1),
      )
      ref.current.setMatrixAt(i, m)
      if (colors) ref.current.setColorAt(i, col.set(colors[i % colors.length]))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [items, colors])
  if (items.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      {geometry}
      <meshStandardMaterial
        color={mat.color}
        roughness={mat.roughness ?? 0.9}
        metalness={mat.metalness ?? 0}
        flatShading={mat.flatShading}
        transparent={mat.transparent}
        opacity={mat.opacity ?? 1}
        emissive={mat.emissive}
        emissiveIntensity={mat.emissiveIntensity ?? 0}
      />
    </instancedMesh>
  )
}

const unitBox = <boxGeometry args={[1, 1, 1]} />

/** Unit-box instanced set — walls, partitions, slabs, steps, counters. */
export function BoxSet({ items, color, ...rest }: { items: Xf[]; color: string } & Omit<InstancedProps, 'items' | 'geometry' | 'color'>) {
  return <Instanced items={items} geometry={unitBox} color={color} {...rest} />
}

/** Rotate a local offset (lx, lz) by rotY and translate to an anchor. */
function xf(anchorPos: Vec2, yBase: number, rotY: number, lx: number, ly: number, lz: number, scale?: [number, number, number]): Xf {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return {
    pos: [anchorPos[0] + lx * c + lz * s, yBase + ly, anchorPos[1] - lx * s + lz * c],
    rotY,
    scale,
  }
}

// ── Furniture sets (geometry numbers mirror the Fase 1 furniture kit) ───────

const WOOD = '#b08968'
const WOOD_DARK = '#8a6b4f'
const FABRIC = '#7d8ca3'

/** Full desk kit (table + monitor + keyboard + chair) for a list of chair
    anchors. 8 draw calls total, however many desks. */
export function DeskSet({ spots, floor }: { spots: DeskSpot[]; floor: number }) {
  const y = floorY(floor)
  const tops: Xf[] = []
  const legs: Xf[] = []
  const monitors: Xf[] = []
  const screens: Xf[] = []
  const keyboards: Xf[] = []
  const seats: Xf[] = []
  const backs: Xf[] = []
  const posts: Xf[] = []
  for (const d of spots) {
    const fx = Math.sin(d.rotY)
    const fz = Math.cos(d.rotY)
    const table: Vec2 = [d.pos[0] + fx * 0.62, d.pos[1] + fz * 0.62]
    tops.push(xf(table, y, d.rotY, 0, 0.74, 0, [2.3, 0.08, 1.1]))
    for (const [lx, lz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const) {
      legs.push(xf(table, y, d.rotY, lx, 0.37, lz, [0.07, 0.74, 0.07]))
    }
    monitors.push(xf(table, y, d.rotY, 0, 1.12, -0.28, [0.95, 0.58, 0.05]))
    screens.push(xf(table, y, d.rotY, 0, 1.12, -0.245, [0.87, 0.5, 1]))
    keyboards.push(xf(table, y, d.rotY, 0, 0.79, 0.05, [0.7, 0.03, 0.25]))
    seats.push(xf(d.pos, y, d.rotY, 0, 0.46, 0, [0.52, 0.07, 0.5]))
    backs.push(xf(d.pos, y, d.rotY, 0, 0.85, -0.26, [0.52, 0.85, 0.07]))
    posts.push(xf(d.pos, y, d.rotY, 0, 0.23, 0, [0.1, 0.46, 0.1]))
  }
  return (
    <group>
      <Instanced items={tops} geometry={unitBox} color={WOOD} roughness={0.7} />
      <Instanced items={legs} geometry={unitBox} color={WOOD_DARK} castShadow={false} />
      <Instanced items={monitors} geometry={unitBox} color="#2c2a26" castShadow={false} />
      <Instanced items={screens} geometry={<planeGeometry args={[1, 1]} />} color="#a8d8f0" emissive="#6db3dd" emissiveIntensity={0.55} castShadow={false} />
      <Instanced items={keyboards} geometry={unitBox} color="#e8e2d4" castShadow={false} />
      <Instanced items={seats} geometry={unitBox} color={FABRIC} />
      <Instanced items={backs} geometry={unitBox} color={FABRIC} />
      <Instanced items={posts} geometry={<cylinderGeometry args={[0.5, 0.5, 1, 8]} />} color="#55524c" castShadow={false} />
    </group>
  )
}

/** Simple chairs (meeting rooms): seat + back. 2 draw calls. */
export function ChairSet({ spots, floor, color = FABRIC }: { spots: DeskSpot[]; floor: number; color?: string }) {
  const y = floorY(floor)
  const seats = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.46, 0, [0.52, 0.07, 0.5] as [number, number, number]))
  const backs = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.85, -0.26, [0.52, 0.85, 0.07] as [number, number, number]))
  return (
    <group>
      <Instanced items={seats} geometry={unitBox} color={color} />
      <Instanced items={backs} geometry={unitBox} color={color} />
    </group>
  )
}

/** Potted plants: pot + two foliage blobs. 3 draw calls. */
export function PlantSet({ spots, floor }: { spots: { pos: Vec2; s?: number }[]; floor: number }) {
  const y = floorY(floor)
  const pots: Xf[] = []
  const leafA: Xf[] = []
  const leafB: Xf[] = []
  for (const p of spots) {
    const s = p.s ?? 1
    pots.push({ pos: [p.pos[0], y + 0.25 * s, p.pos[1]], scale: [s, s, s] })
    leafA.push({ pos: [p.pos[0], y + 0.85 * s, p.pos[1]], scale: [s, s, s] })
    leafB.push({ pos: [p.pos[0] + 0.25 * s, y + 0.65 * s, p.pos[1] + 0.15 * s], scale: [s, s, s] })
  }
  return (
    <group>
      <Instanced items={pots} geometry={<cylinderGeometry args={[0.22, 0.17, 0.5, 10]} />} color="#c96f4a" roughness={0.85} />
      <Instanced items={leafA} geometry={<icosahedronGeometry args={[0.42, 1]} />} color="#5f9e6e" flatShading />
      <Instanced items={leafB} geometry={<icosahedronGeometry args={[0.26, 1]} />} color="#6fae7d" flatShading />
    </group>
  )
}

/** Sofas: base + back + arms. 3 draw calls. Per-spot colour supported. */
export function SofaSet({ spots, floor, color = '#e8b08a' }: { spots: (DeskSpot & { color?: string })[]; floor: number; color?: string }) {
  const y = floorY(floor)
  const bases = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.32, 0, [2.2, 0.5, 0.9] as [number, number, number]))
  const backs = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.75, -0.38, [2.2, 0.75, 0.18] as [number, number, number]))
  const arms: Xf[] = []
  for (const d of spots) {
    arms.push(xf(d.pos, y, d.rotY, -1.05, 0.55, 0, [0.22, 0.45, 0.9]))
    arms.push(xf(d.pos, y, d.rotY, 1.05, 0.55, 0, [0.22, 0.45, 0.9]))
  }
  const perSpot = spots.some((s) => s.color)
  const colors = perSpot ? spots.map((s) => s.color ?? color) : undefined
  const armColors = perSpot ? spots.flatMap((s) => [s.color ?? color, s.color ?? color]) : undefined
  const matColor = perSpot ? '#ffffff' : color
  return (
    <group>
      <Instanced items={bases} geometry={unitBox} color={matColor} colors={colors} roughness={0.95} />
      <Instanced items={backs} geometry={unitBox} color={matColor} colors={colors} roughness={0.95} />
      <Instanced items={arms} geometry={unitBox} color={matColor} colors={armColors} roughness={0.95} />
    </group>
  )
}

/** Focus pods: shell + glass front + inner desk top, in the anchor's local
    frame (local +z = facing): agent sits at the back, desk + glass in front.
    3 draw calls. */
export function PodSet({ spots, floor }: { spots: DeskSpot[]; floor: number }) {
  const y = floorY(floor)
  const shells = spots.map((d) => xf(d.pos, y, d.rotY, 0, 1.3, 0.8, [2.6, 2.6, 1.9] as [number, number, number]))
  const glass = spots.map((d) => xf(d.pos, y, d.rotY, 0, 1.35, 1.76, [1.6, 1.7, 0.06] as [number, number, number]))
  const tops = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.78, 1.2, [1, 0.05, 0.8] as [number, number, number]))
  return (
    <group>
      <Instanced items={shells} geometry={unitBox} color="#efe6d4" />
      <Instanced items={glass} geometry={unitBox} color="#bcd9ea" transparent opacity={0.45} roughness={0.1} castShadow={false} />
      <Instanced items={tops} geometry={unitBox} color={WOOD} castShadow={false} />
    </group>
  )
}

/** Beds: frame + mattress + pillow. 3 draw calls. */
export function BedSet({ spots, floor }: { spots: { pos: Vec2; rotY: number }[]; floor: number }) {
  const y = floorY(floor)
  const frames = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.28, 0, [1.1, 0.35, 2.3] as [number, number, number]))
  const mattresses = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.52, 0, [1.02, 0.18, 2.2] as [number, number, number]))
  const pillows = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.66, -0.85, [0.7, 0.12, 0.45] as [number, number, number]))
  return (
    <group>
      <Instanced items={frames} geometry={unitBox} color={WOOD_DARK} />
      <Instanced items={mattresses} geometry={unitBox} color="#f5efe4" roughness={0.95} />
      <Instanced items={pillows} geometry={unitBox} color="#dceefb" roughness={0.95} castShadow={false} />
    </group>
  )
}

/** Round café/lounge tables: top + post (+ optional umbrella). 2–4 calls. */
export function RoundTableSet({ spots, floor, umbrella = false }: { spots: Vec2[]; floor: number; umbrella?: boolean }) {
  const y = floorY(floor)
  const tops = spots.map((p) => ({ pos: [p[0], y + 0.75, p[1]] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }))
  const posts = spots.map((p) => ({ pos: [p[0], y + 0.37, p[1]] as [number, number, number] }))
  const cones = spots.map((p, i) => ({ pos: [p[0], y + 1.65, p[1]] as [number, number, number], rotY: i * 0.7 }))
  const poles = spots.map((p) => ({ pos: [p[0], y + 0.85, p[1]] as [number, number, number] }))
  return (
    <group>
      <Instanced items={tops} geometry={<cylinderGeometry args={[0.85, 0.85, 0.06, 14]} />} color="#f5efe4" />
      <Instanced items={posts} geometry={<cylinderGeometry args={[0.06, 0.06, 0.75, 8]} />} color="#55524c" castShadow={false} />
      {umbrella && (
        <>
          <Instanced items={cones} geometry={<coneGeometry args={[1.6, 0.55, 10]} />} color="#e0654f" />
          <Instanced items={poles} geometry={<cylinderGeometry args={[0.05, 0.05, 1.7, 6]} />} color="#55524c" castShadow={false} />
        </>
      )}
    </group>
  )
}

/** Pendant lamp shades + cords (no point lights — those stay scarce). 2 calls. */
export function LampSet({ spots, floor }: { spots: Vec2[]; floor: number }) {
  const y = floorY(floor)
  const cords = spots.map((p) => ({ pos: [p[0], y + 3.55, p[1]] as [number, number, number] }))
  const shades = spots.map((p) => ({ pos: [p[0], y + 3.28, p[1]] as [number, number, number] }))
  return (
    <group>
      <Instanced items={cords} geometry={<cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />} color="#55524c" castShadow={false} />
      <Instanced items={shades} geometry={<coneGeometry args={[0.32, 0.28, 12, 1, true]} />} color="#f59e4c" castShadow={false} />
    </group>
  )
}
