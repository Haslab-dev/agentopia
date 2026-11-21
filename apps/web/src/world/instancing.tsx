import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useUiStore } from '../state/stores'
import { floorY, type DeskSpot, type Vec2 } from './layout'
import type { BuildingId } from '../state/agentRuntime'

// ─────────────────────────────────────────────────────────────────────────────
// Instancing layer (ARCHITECTURE.md §2.4): repeated kit parts render as ONE
// InstancedMesh per part type per zone — this is what brings the static
// campus under the <150 draw-call budget. A "zone" is one floor of one
// building (or the outdoors); zone visibility follows the HQ floor selector.
//
// Fase 7: HQ furniture sets are merged ACROSS floors into one InstancedMesh
// per part type (InstancedCapped). Instances are ordered by floor ascending
// and the mesh `count` is capped at the prefix belonging to floors ≤ the
// selected one — the exact same visibility rule ZoneGroup applies
// (zoneVisible), so floor-selected views are pixel-identical while the
// All-floors view drops one mesh set per extra floor per part type.
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

function useInstanceMatrices(ref: React.RefObject<THREE.InstancedMesh | null>, items: Xf[], colors?: string[]) {
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || items.length === 0) return
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
      mesh.setMatrixAt(i, m)
      if (colors) mesh.setColorAt(i, col.set(colors[i % colors.length]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [ref, items, colors])
}

function instancedMaterial(mat: Omit<InstancedProps, 'items' | 'geometry' | 'colors'>) {
  return (
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
  )
}

/** One draw call for N copies of a part. Geometry is supplied as a child
    (e.g. <boxGeometry args={[1,1,1]} />) and scaled per instance. */
export function Instanced({ items, geometry, colors, castShadow = true, receiveShadow = false, ...mat }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useInstanceMatrices(ref, items, colors)
  if (items.length === 0) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      {geometry}
      {instancedMaterial({ ...mat, color: mat.color })}
    </instancedMesh>
  )
}

/** Fase 7: one InstancedMesh whose instances are grouped by HQ floor
    (index = floor, ascending). Draws only the prefix on floors ≤ the
    selected floor (all of them in All-floors view) by capping `count` —
    the same rule ZoneGroup/zoneVisible applies to per-floor groups. */
export function InstancedCapped({ floorsItems, geometry, colors, castShadow = true, receiveShadow = false, ...mat }: Omit<InstancedProps, 'items'> & { floorsItems: Xf[][] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const all = useMemo(() => floorsItems.flat(), [floorsItems])
  const caps = useMemo(() => {
    const out: number[] = []
    let n = 0
    for (const f of floorsItems) { n += f.length; out.push(n) }
    return out
  }, [floorsItems])
  useInstanceMatrices(ref, all, colors)
  const hqFloor = useUiStore((s) => s.hqFloor)
  if (all.length === 0) return null
  const count = hqFloor === 'all' ? all.length : (caps[hqFloor] ?? all.length)
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, all.length]} count={count} castShadow={castShadow} receiveShadow={receiveShadow}>
      {geometry}
      {instancedMaterial({ ...mat, color: mat.color })}
    </instancedMesh>
  )
}

const unitBox = <boxGeometry args={[1, 1, 1]} />
export const UNIT_BOX = unitBox

/** Unit-box instanced set — walls, partitions, slabs, steps, counters. */
export function BoxSet({ items, color, ...rest }: { items: Xf[]; color: string } & Omit<InstancedProps, 'items' | 'geometry' | 'color'>) {
  return <Instanced items={items} geometry={unitBox} color={color} {...rest} />
}

/** Unit-box capped set (Fase 7) — BoxSet merged across HQ floors. */
export function BoxSetCapped({ floorsItems, color, ...rest }: { floorsItems: Xf[][]; color: string } & Omit<InstancedProps, 'items' | 'geometry' | 'color'>) {
  return <InstancedCapped floorsItems={floorsItems} geometry={unitBox} color={color} {...rest} />
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
// Fase 7: item computation is split from rendering (…Items builders) so the
// same arrays can feed per-zone sets (other buildings) or floor-merged
// capped sets (HQ) without duplicating the kit math.

const WOOD = '#b08968'
const WOOD_DARK = '#8a6b4f'
const FABRIC = '#7d8ca3'

export interface DeskItems { tops: Xf[]; legs: Xf[]; monitors: Xf[]; screens: Xf[]; keyboards: Xf[]; seats: Xf[]; backs: Xf[]; posts: Xf[] }

export function deskItems(spots: DeskSpot[], floor: number): DeskItems {
  const y = floorY(floor)
  const out: DeskItems = { tops: [], legs: [], monitors: [], screens: [], keyboards: [], seats: [], backs: [], posts: [] }
  for (const d of spots) {
    const fx = Math.sin(d.rotY)
    const fz = Math.cos(d.rotY)
    const table: Vec2 = [d.pos[0] + fx * 0.62, d.pos[1] + fz * 0.62]
    out.tops.push(xf(table, y, d.rotY, 0, 0.74, 0, [2.3, 0.08, 1.1]))
    for (const [lx, lz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const) {
      out.legs.push(xf(table, y, d.rotY, lx, 0.37, lz, [0.07, 0.74, 0.07]))
    }
    out.monitors.push(xf(table, y, d.rotY, 0, 1.12, -0.28, [0.95, 0.58, 0.05]))
    out.screens.push(xf(table, y, d.rotY, 0, 1.12, -0.245, [0.87, 0.5, 1]))
    out.keyboards.push(xf(table, y, d.rotY, 0, 0.79, 0.05, [0.7, 0.03, 0.25]))
    out.seats.push(xf(d.pos, y, d.rotY, 0, 0.46, 0, [0.52, 0.07, 0.5]))
    out.backs.push(xf(d.pos, y, d.rotY, 0, 0.85, -0.26, [0.52, 0.85, 0.07]))
    out.posts.push(xf(d.pos, y, d.rotY, 0, 0.23, 0, [0.1, 0.46, 0.1]))
  }
  return out
}

/** Full desk kit (table + monitor + keyboard + chair) for a list of chair
    anchors. 8 draw calls total, however many desks. */
export function DeskSet({ spots, floor }: { spots: DeskSpot[]; floor: number }) {
  const it = deskItems(spots, floor)
  return (
    <group>
      <Instanced items={it.tops} geometry={unitBox} color={WOOD} roughness={0.7} />
      <Instanced items={it.legs} geometry={unitBox} color={WOOD_DARK} castShadow={false} />
      <Instanced items={it.monitors} geometry={unitBox} color="#2c2a26" castShadow={false} />
      <Instanced items={it.screens} geometry={<planeGeometry args={[1, 1]} />} color="#a8d8f0" emissive="#6db3dd" emissiveIntensity={0.55} castShadow={false} />
      <Instanced items={it.keyboards} geometry={unitBox} color="#e8e2d4" castShadow={false} />
      <Instanced items={it.seats} geometry={unitBox} color={FABRIC} />
      <Instanced items={it.backs} geometry={unitBox} color={FABRIC} />
      <Instanced items={it.posts} geometry={<cylinderGeometry args={[0.5, 0.5, 1, 8]} />} color="#55524c" castShadow={false} />
    </group>
  )
}

export interface ChairItems { seats: Xf[]; backs: Xf[] }

export function chairItems(spots: DeskSpot[], floor: number): ChairItems {
  const y = floorY(floor)
  return {
    seats: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.46, 0, [0.52, 0.07, 0.5] as [number, number, number])),
    backs: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.85, -0.26, [0.52, 0.85, 0.07] as [number, number, number])),
  }
}

/** Simple chairs (meeting rooms): seat + back. 2 draw calls. */
export function ChairSet({ spots, floor, color = FABRIC }: { spots: DeskSpot[]; floor: number; color?: string }) {
  const it = chairItems(spots, floor)
  return (
    <group>
      <Instanced items={it.seats} geometry={unitBox} color={color} />
      <Instanced items={it.backs} geometry={unitBox} color={color} />
    </group>
  )
}

export interface PlantItems { pots: Xf[]; leafA: Xf[]; leafB: Xf[] }

export function plantItems(spots: { pos: Vec2; s?: number }[], floor: number): PlantItems {
  const y = floorY(floor)
  const out: PlantItems = { pots: [], leafA: [], leafB: [] }
  for (const p of spots) {
    const s = p.s ?? 1
    out.pots.push({ pos: [p.pos[0], y + 0.25 * s, p.pos[1]], scale: [s, s, s] })
    out.leafA.push({ pos: [p.pos[0], y + 0.85 * s, p.pos[1]], scale: [s, s, s] })
    out.leafB.push({ pos: [p.pos[0] + 0.25 * s, y + 0.65 * s, p.pos[1] + 0.15 * s], scale: [s, s, s] })
  }
  return out
}

/** Potted plants: pot + two foliage blobs. 3 draw calls. */
export function PlantSet({ spots, floor }: { spots: { pos: Vec2; s?: number }[]; floor: number }) {
  const it = plantItems(spots, floor)
  return (
    <group>
      <Instanced items={it.pots} geometry={<cylinderGeometry args={[0.22, 0.17, 0.5, 10]} />} color="#c96f4a" roughness={0.85} />
      <Instanced items={it.leafA} geometry={<icosahedronGeometry args={[0.42, 1]} />} color="#5f9e6e" flatShading />
      <Instanced items={it.leafB} geometry={<icosahedronGeometry args={[0.26, 1]} />} color="#6fae7d" flatShading />
    </group>
  )
}

export interface SofaItems { bases: Xf[]; backs: Xf[]; arms: Xf[]; colors?: string[]; armColors?: string[]; matColor: string }

export function sofaItems(spots: (DeskSpot & { color?: string })[], floor: number, color = '#e8b08a'): SofaItems {
  const y = floorY(floor)
  const bases = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.32, 0, [2.2, 0.5, 0.9] as [number, number, number]))
  const backs = spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.75, -0.38, [2.2, 0.75, 0.18] as [number, number, number]))
  const arms: Xf[] = []
  for (const d of spots) {
    arms.push(xf(d.pos, y, d.rotY, -1.05, 0.55, 0, [0.22, 0.45, 0.9]))
    arms.push(xf(d.pos, y, d.rotY, 1.05, 0.55, 0, [0.22, 0.45, 0.9]))
  }
  const perSpot = spots.some((s) => s.color)
  return {
    bases, backs, arms,
    colors: perSpot ? spots.map((s) => s.color ?? color) : undefined,
    armColors: perSpot ? spots.flatMap((s) => [s.color ?? color, s.color ?? color]) : undefined,
    matColor: perSpot ? '#ffffff' : color,
  }
}

/** Sofas: base + back + arms. 3 draw calls. Per-spot colour supported. */
export function SofaSet({ spots, floor, color = '#e8b08a' }: { spots: (DeskSpot & { color?: string })[]; floor: number; color?: string }) {
  const it = sofaItems(spots, floor, color)
  return (
    <group>
      <Instanced items={it.bases} geometry={unitBox} color={it.matColor} colors={it.colors} roughness={0.95} />
      <Instanced items={it.backs} geometry={unitBox} color={it.matColor} colors={it.colors} roughness={0.95} />
      <Instanced items={it.arms} geometry={unitBox} color={it.matColor} colors={it.armColors} roughness={0.95} />
    </group>
  )
}

export interface PodItems { shells: Xf[]; glass: Xf[]; tops: Xf[] }

export function podItems(spots: DeskSpot[], floor: number): PodItems {
  const y = floorY(floor)
  return {
    shells: spots.map((d) => xf(d.pos, y, d.rotY, 0, 1.3, 0.8, [2.6, 2.6, 1.9] as [number, number, number])),
    glass: spots.map((d) => xf(d.pos, y, d.rotY, 0, 1.35, 1.76, [1.6, 1.7, 0.06] as [number, number, number])),
    tops: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.78, 1.2, [1, 0.05, 0.8] as [number, number, number])),
  }
}

/** Focus pods: shell + glass front + inner desk top, in the anchor's local
    frame (local +z = facing): agent sits at the back, desk + glass in front.
    3 draw calls. */
export function PodSet({ spots, floor }: { spots: DeskSpot[]; floor: number }) {
  const it = podItems(spots, floor)
  return (
    <group>
      <Instanced items={it.shells} geometry={unitBox} color="#efe6d4" />
      <Instanced items={it.glass} geometry={unitBox} color="#bcd9ea" transparent opacity={0.45} roughness={0.1} castShadow={false} />
      <Instanced items={it.tops} geometry={unitBox} color={WOOD} castShadow={false} />
    </group>
  )
}

export interface BedItems { frames: Xf[]; mattresses: Xf[]; pillows: Xf[] }

export function bedItems(spots: { pos: Vec2; rotY: number }[], floor: number): BedItems {
  const y = floorY(floor)
  return {
    frames: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.28, 0, [1.1, 0.35, 2.3] as [number, number, number])),
    mattresses: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.52, 0, [1.02, 0.18, 2.2] as [number, number, number])),
    pillows: spots.map((d) => xf(d.pos, y, d.rotY, 0, 0.66, -0.85, [0.7, 0.12, 0.45] as [number, number, number])),
  }
}

/** Beds: frame + mattress + pillow. 3 draw calls. */
export function BedSet({ spots, floor }: { spots: { pos: Vec2; rotY: number }[]; floor: number }) {
  const it = bedItems(spots, floor)
  return (
    <group>
      <Instanced items={it.frames} geometry={unitBox} color={WOOD_DARK} />
      <Instanced items={it.mattresses} geometry={unitBox} color="#f5efe4" roughness={0.95} />
      <Instanced items={it.pillows} geometry={unitBox} color="#dceefb" roughness={0.95} castShadow={false} />
    </group>
  )
}

export interface RoundTableItems { tops: Xf[]; posts: Xf[]; cones: Xf[]; poles: Xf[] }

export function roundTableItems(spots: Vec2[], floor: number): RoundTableItems {
  const y = floorY(floor)
  return {
    tops: spots.map((p) => ({ pos: [p[0], y + 0.75, p[1]] as [number, number, number], scale: [1, 1, 1] as [number, number, number] })),
    posts: spots.map((p) => ({ pos: [p[0], y + 0.37, p[1]] as [number, number, number] })),
    cones: spots.map((p, i) => ({ pos: [p[0], y + 1.65, p[1]] as [number, number, number], rotY: i * 0.7 })),
    poles: spots.map((p) => ({ pos: [p[0], y + 0.85, p[1]] as [number, number, number] })),
  }
}

/** Round café/lounge tables: top + post (+ optional umbrella). 2–4 calls. */
export function RoundTableSet({ spots, floor, umbrella = false }: { spots: Vec2[]; floor: number; umbrella?: boolean }) {
  const it = roundTableItems(spots, floor)
  return (
    <group>
      <Instanced items={it.tops} geometry={<cylinderGeometry args={[0.85, 0.85, 0.06, 14]} />} color="#f5efe4" />
      <Instanced items={it.posts} geometry={<cylinderGeometry args={[0.06, 0.06, 0.75, 8]} />} color="#55524c" castShadow={false} />
      {umbrella && (
        <>
          <Instanced items={it.cones} geometry={<coneGeometry args={[1.6, 0.55, 10]} />} color="#e0654f" />
          <Instanced items={it.poles} geometry={<cylinderGeometry args={[0.05, 0.05, 1.7, 6]} />} color="#55524c" castShadow={false} />
        </>
      )}
    </group>
  )
}

export interface LampItems { cords: Xf[]; shades: Xf[] }

export function lampItems(spots: Vec2[], floor: number): LampItems {
  const y = floorY(floor)
  return {
    cords: spots.map((p) => ({ pos: [p[0], y + 3.55, p[1]] as [number, number, number] })),
    shades: spots.map((p) => ({ pos: [p[0], y + 3.28, p[1]] as [number, number, number] })),
  }
}

/** Pendant lamp shades + cords (no point lights — those stay scarce). 2 calls. */
export function LampSet({ spots, floor }: { spots: Vec2[]; floor: number }) {
  const it = lampItems(spots, floor)
  return (
    <group>
      <Instanced items={it.cords} geometry={<cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />} color="#55524c" castShadow={false} />
      <Instanced items={it.shades} geometry={<coneGeometry args={[0.32, 0.28, 12, 1, true]} />} color="#f59e4c" castShadow={false} />
    </group>
  )
}
