import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { ZoneGroup } from './instancing'
import { floorY } from './layout'
import {
  catalogOf, placementValid, useEditorStore, zoneSpec,
  type EditorObjType, type PlacedObject,
} from '../state/editor'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — World Editor layer. Renders the user's ADDED objects (state/
// editor.ts) on top of the built-in furniture, plus — only in Build Mode
// and only on the active zone — the ghost preview and forbidden-zone
// overlays. Built-in furniture is instanced elsewhere and is never
// selectable or deletable here.
//
// Interaction: pointer position is raycast manually onto the active floor
// plane (mathematical plane, no helper mesh). While Build Mode is open the
// left mouse button / one-finger touch belong to the editor; orbit moves
// to the right button / two fingers (OrbitControls config swapped in an
// effect, restored on exit). Editor objects are decorative: nothing here
// talks to the simulation or the router.
// ─────────────────────────────────────────────────────────────────────────────

const WOOD = '#b08968'
const WOOD_DARK = '#8a6b4f'
const FABRIC = '#7d8ca3'
const CREAM = '#efe6d4'

function Mat({ color, ghost, rough = 0.85, emissive, ei = 0 }: {
  color: string; ghost?: boolean; rough?: number; emissive?: string; ei?: number
}) {
  return (
    <meshStandardMaterial
      color={color} roughness={rough} transparent={ghost} opacity={ghost ? 0.5 : 1}
      emissive={emissive} emissiveIntensity={ei} depthWrite={!ghost}
    />
  )
}

function Box({ p, s, color, ghost, rough, emissive, ei }: {
  p: [number, number, number]; s: [number, number, number]; color: string
  ghost?: boolean; rough?: number; emissive?: string; ei?: number
}) {
  return (
    <mesh position={p} castShadow={!ghost} receiveShadow>
      <boxGeometry args={s} />
      <Mat color={color} ghost={ghost} rough={rough} emissive={emissive} ei={ei} />
    </mesh>
  )
}

/** Procedural editor object, base at y=0 in its local frame. */
export function EditorObjectMesh({ type, ghost = false }: { type: EditorObjType; ghost?: boolean }) {
  const g = ghost
  switch (type) {
    case 'desk':
      return (
        <group>
          <Box p={[0, 0.74, 0]} s={[2, 0.08, 1]} color={WOOD} ghost={g} rough={0.7} />
          {[[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].map(([x, z], i) => (
            <Box key={i} p={[x, 0.37, z]} s={[0.07, 0.74, 0.07]} color={WOOD_DARK} ghost={g} />
          ))}
          <Box p={[0, 1.12, -0.3]} s={[0.95, 0.58, 0.05]} color="#2c2a26" ghost={g} />
          <Box p={[0, 1.12, -0.27]} s={[0.87, 0.5, 0.02]} color="#a8d8f0" ghost={g} emissive="#6db3dd" ei={0.55} />
        </group>
      )
    case 'chair':
      return (
        <group>
          <Box p={[0, 0.46, 0]} s={[0.52, 0.07, 0.5]} color={FABRIC} ghost={g} rough={0.95} />
          <Box p={[0, 0.85, -0.26]} s={[0.52, 0.85, 0.07]} color={FABRIC} ghost={g} rough={0.95} />
          <mesh position={[0, 0.23, 0]} castShadow={!g}>
            <cylinderGeometry args={[0.05, 0.05, 0.46, 8]} />
            <Mat color="#55524c" ghost={g} />
          </mesh>
        </group>
      )
    case 'plant':
      return (
        <group>
          <mesh position={[0, 0.25, 0]} castShadow={!g}>
            <cylinderGeometry args={[0.22, 0.17, 0.5, 10]} />
            <Mat color="#c96f4a" ghost={g} />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow={!g}>
            <icosahedronGeometry args={[0.42, 1]} />
            <Mat color="#5f9e6e" ghost={g} rough={1} />
          </mesh>
          <mesh position={[0.25, 0.65, 0.15]} castShadow={!g}>
            <icosahedronGeometry args={[0.26, 1]} />
            <Mat color="#6fae7d" ghost={g} rough={1} />
          </mesh>
        </group>
      )
    case 'server':
      return (
        <group>
          <Box p={[0, 1.1, 0]} s={[1.1, 2.2, 1.7]} color="#33302b" ghost={g} rough={0.6} />
          {[0.45, 0.95, 1.45, 1.9].map((y, i) => (
            <Box key={i} p={[0, y, 0.86]} s={[0.9, 0.07, 0.02]} color="#7ee2a0" ghost={g} emissive="#39d353" ei={0.8} />
          ))}
        </group>
      )
    case 'sofa':
      return (
        <group>
          <Box p={[0, 0.32, 0]} s={[2.2, 0.5, 0.9]} color="#e8b08a" ghost={g} rough={0.95} />
          <Box p={[0, 0.75, -0.38]} s={[2.2, 0.75, 0.18]} color="#e8b08a" ghost={g} rough={0.95} />
          <Box p={[-1.05, 0.55, 0]} s={[0.22, 0.45, 0.9]} color="#e8b08a" ghost={g} rough={0.95} />
          <Box p={[1.05, 0.55, 0]} s={[0.22, 0.45, 0.9]} color="#e8b08a" ghost={g} rough={0.95} />
        </group>
      )
    case 'beanbag':
      return (
        <mesh position={[0, 0.32, 0]} scale={[1, 0.62, 1]} castShadow={!g} receiveShadow>
          <sphereGeometry args={[0.62, 14, 10]} />
          <Mat color="#b48ce0" ghost={g} rough={1} />
        </mesh>
      )
    case 'meeting-table':
      return (
        <group>
          <Box p={[0, 0.76, 0]} s={[3.8, 0.1, 1.7]} color={WOOD} ghost={g} rough={0.6} />
          <Box p={[0, 0.38, 0]} s={[3.2, 0.76, 1.1]} color={WOOD_DARK} ghost={g} />
        </group>
      )
    case 'whiteboard':
      return (
        <group>
          <Box p={[0, 1.5, 0]} s={[2.5, 1.4, 0.06]} color="#ffffff" ghost={g} rough={0.5} />
          <Box p={[0, 1.5, 0.045]} s={[2.3, 1.2, 0.01]} color="#eef4f8" ghost={g} rough={0.4} />
          <Box p={[-1.1, 0.55, 0]} s={[0.06, 1.1, 0.06]} color="#55524c" ghost={g} />
          <Box p={[1.1, 0.55, 0]} s={[0.06, 1.1, 0.06]} color="#55524c" ghost={g} />
        </group>
      )
    case 'lamp':
      return (
        <group>
          <mesh position={[0, 0.03, 0]} castShadow={!g}>
            <cylinderGeometry args={[0.22, 0.26, 0.06, 12]} />
            <Mat color="#55524c" ghost={g} />
          </mesh>
          <mesh position={[0, 0.85, 0]} castShadow={!g}>
            <cylinderGeometry args={[0.03, 0.03, 1.7, 6]} />
            <Mat color="#55524c" ghost={g} />
          </mesh>
          <mesh position={[0, 1.78, 0]} castShadow={!g}>
            <coneGeometry args={[0.34, 0.3, 12, 1, true]} />
            <Mat color="#f59e4c" ghost={g} emissive="#ffb35c" ei={0.35} />
          </mesh>
        </group>
      )
    case 'partition':
      return (
        <group>
          <Box p={[0, 1.5, 0]} s={[2.5, 3, 0.1]} color={CREAM} ghost={g} rough={0.95} />
          <Box p={[-1.1, 0.04, 0]} s={[0.3, 0.08, 0.4]} color={WOOD_DARK} ghost={g} />
          <Box p={[1.1, 0.04, 0]} s={[0.3, 0.08, 0.4]} color={WOOD_DARK} ghost={g} />
        </group>
      )
  }
}

interface DragState {
  id: string
  start: [number, number]
  valid: boolean
}

export function EditorLayer() {
  const buildMode = useEditorStore((s) => s.buildMode)
  const zone = useEditorStore((s) => s.zone)
  const objects = useEditorStore((s) => s.objects)
  const placingType = useEditorStore((s) => s.placingType)
  const selectedId = useEditorStore((s) => s.selectedId)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as {
    mouseButtons?: Record<string, unknown>; touches?: Record<string, unknown>; enabled: boolean
  } | null

  const [ghost, setGhost] = useState<{ x: number; z: number; valid: boolean } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const hitRef = useRef(false)

  // Swap OrbitControls buttons while building: left/one-finger = editor,
  // right = rotate, wheel/two-finger keep zoom/pan. Restored on exit.
  useEffect(() => {
    if (!controls || !buildMode) return
    const prevMouse = controls.mouseButtons
    const prevTouches = controls.touches
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }
    return () => {
      controls.mouseButtons = prevMouse
      controls.touches = prevTouches
    }
  }, [controls, buildMode])

  // Pointer → floor plane of the active zone (manual raycast).
  useEffect(() => {
    if (!buildMode) return
    const st = useEditorStore.getState()
    const planeY = floorY(st.zone.floor) + 0.14
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    const snapV = (v: number) => (useEditorStore.getState().snap ? Math.round(v / 0.5) * 0.5 : v)

    const floorPoint = (e: PointerEvent): [number, number] | null => {
      const r = gl.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null
    }

    const onMove = (e: PointerEvent) => {
      const s = useEditorStore.getState()
      const p = floorPoint(e)
      if (!p) return
      if (dragRef.current) {
        const d = dragRef.current
        const obj = s.objects.find((o) => o.id === d.id)
        if (!obj) return
        const nx = snapV(p[0])
        const nz = snapV(p[1])
        d.valid = placementValid(obj.building, obj.floor, obj.type, nx, nz)
        s.moveObject(d.id, [nx, nz])
      } else if (s.placingType) {
        const nx = snapV(p[0])
        const nz = snapV(p[1])
        setGhost({ x: nx, z: nz, valid: placementValid(s.zone.building, s.zone.floor, s.placingType, nx, nz) })
      }
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const s = useEditorStore.getState()
      if (hitRef.current) { hitRef.current = false; return } // an editor object took this click (select/drag)
      const p = floorPoint(e)
      if (!p) return
      if (s.placingType) {
        const nx = snapV(p[0])
        const nz = snapV(p[1])
        if (placementValid(s.zone.building, s.zone.floor, s.placingType, nx, nz)) {
          s.addObject({ type: s.placingType, building: s.zone.building, floor: s.zone.floor, pos: [nx, nz], rotY: 0 })
          setGhost(null)
        }
        // invalid spot: refuse silently here — the red ghost already said why
      } else {
        s.select(null)
      }
    }
    const onUp = () => {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      if (!d.valid) useEditorStore.getState().moveObject(d.id, d.start) // revert out of forbidden zone
    }
    const onLeave = () => setGhost(null)

    const el = gl.domElement
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [buildMode, camera, gl, zone.building, zone.floor])

  const byZone = new Map<string, PlacedObject[]>()
  for (const o of objects) {
    const k = `${o.building}:${o.floor}`
    const arr = byZone.get(k) ?? []
    arr.push(o)
    byZone.set(k, arr)
  }
  const spec = zoneSpec(zone.building, zone.floor)
  const zoneY = floorY(zone.floor)

  return (
    <group name="editor-layer">
      {[...byZone.entries()].map(([k, arr]) => {
        const [b, f] = k.split(':')
        return (
          <ZoneGroup key={k} zone={{ building: b as PlacedObject['building'], floor: Number(f) }}>
            {arr.map((o) => {
              const active = buildMode && o.building === zone.building && o.floor === zone.floor
              const selected = active && o.id === selectedId
              return (
                <group
                  key={o.id}
                  position={[o.pos[0], floorY(o.floor), o.pos[1]]}
                  rotation={[0, o.rotY, 0]}
                  onPointerDown={active ? (e) => {
                    e.stopPropagation()
                    hitRef.current = true
                    useEditorStore.getState().select(o.id)
                    dragRef.current = { id: o.id, start: o.pos, valid: true }
                  } : undefined}
                >
                  <EditorObjectMesh type={o.type} />
                  {active && (
                    // Invisible grab proxy: small kit parts (plant pot, lamp
                    // pole) are a few pixels wide — the declared footprint
                    // radius is the honest grab area in Build Mode.
                    <mesh position={[0, 0.8, 0]}>
                      <cylinderGeometry args={[catalogOf(o.type).radius, catalogOf(o.type).radius, 1.6, 10]} />
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
                    </mesh>
                  )}
                  {selected && (
                    <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[catalogOf(o.type).radius + 0.12, catalogOf(o.type).radius + 0.3, 28]} />
                      <meshBasicMaterial color={dragRef.current && !dragRef.current.valid ? '#e0483e' : '#f59e4c'} transparent opacity={0.9} side={THREE.DoubleSide} />
                    </mesh>
                  )}
                </group>
              )
            })}
          </ZoneGroup>
        )
      })}

      {buildMode && (
        <ZoneGroup zone={{ building: zone.building, floor: zone.floor }}>
          {/* Forbidden zones: door portals + stair bays. Shown only while
              building so the refusal is visible before it happens. */}
          {spec.forbidden.map((r, i) => (
            <mesh
              key={i}
              position={[(r.x1 + r.x2) / 2, zoneY + 0.17, (r.z1 + r.z2) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[r.x2 - r.x1, r.z2 - r.z1]} />
              <meshBasicMaterial color="#e0483e" transparent opacity={0.34} depthWrite={false} />
            </mesh>
          ))}
          {/* Ghost preview of the object being placed. */}
          {placingType && ghost && (
            <group position={[ghost.x, zoneY, ghost.z]}>
              <EditorObjectMesh type={placingType} ghost />
              <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[catalogOf(placingType).radius + 0.12, catalogOf(placingType).radius + 0.3, 28]} />
                <meshBasicMaterial color={ghost.valid ? '#39d353' : '#e0483e'} transparent opacity={0.9} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )}
        </ZoneGroup>
      )}
    </group>
  )
}
