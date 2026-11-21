import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from './Environment'
import { HQBuilding } from './HQBuilding'
import { ResearchBuilding } from './Research'
import { Apartments } from './Apartments'
import { Cafe, FootballField, Pool } from './Recreation'
import { AgentLayer } from './Avatar'
import { CameraRig } from './CameraRig'
import { EditorLayer } from './EditorLayer'
import { useWorldStore } from '../state/stores'

// Performance probe (Fase 2 measurement, kept for Fase 7): samples
// renderer.info + frame rate ~2×/s into window.__LW_PERF__ and, when a
// #perf-overlay element exists (App renders one for ?perf), into the DOM so
// headless runs can read real numbers instead of estimates.
export interface LwPerf { calls: number; triangles: number; fps: number; geometries: number; textures: number }
declare global { interface Window { __LW_PERF__?: LwPerf } }

function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const acc = useRef({ frames: 0, time: 0, last: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.time += dt
    if (a.time >= 0.5) {
      const perf: LwPerf = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        fps: Math.round((a.frames / a.time) * 10) / 10,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      }
      window.__LW_PERF__ = perf
      const el = document.getElementById('perf-overlay')
      if (el) el.textContent = `draw calls ${perf.calls} · tris ${perf.triangles} · fps ${perf.fps} · geo ${perf.geometries} · tex ${perf.textures}`
      a.frames = 0
      a.time = 0
      a.last = 0
    }
  })
  return null
}

// Sun follows the virtual clock (Fase 1 criterion: clock drives the sun).
function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null!)
  useFrame(() => {
    const mins = useWorldStore.getState().simMinutes % (24 * 60)
    const dayT = (mins - 6 * 60) / (12 * 60) // 0 at 06:00 → 1 at 18:00
    const ang = Math.PI * (0.15 + 0.7 * Math.min(1, Math.max(0, dayT)))
    const elev = Math.sin(Math.PI * Math.min(1, Math.max(0, dayT)))
    if (!light.current) return
    light.current.position.set(Math.cos(ang) * 70, 18 + elev * 55, 45)
    light.current.intensity = 1.1 + elev * 1.6
  })
  return (
    <directionalLight
      ref={light}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-80}
      shadow-camera-right={80}
      shadow-camera-top={80}
      shadow-camera-bottom={-80}
      shadow-camera-far={220}
      shadow-bias={-0.0004}
      color="#fff1d6"
    />
  )
}

// Scene graph root: World → District[] → Building → Floor → Room → Object,
// with AgentLayer as a World-level sibling of the districts (§2.1).
export function Scene({ noAgents = false }: { noAgents?: boolean }) {
  return (
    <>
      <color attach="background" args={['#bfd9e8']} />
      <fog attach="fog" args={['#cfe2ee', 150, 300]} />
      <hemisphereLight args={['#eaf4ff', '#7a9a6a', 0.8]} />
      <ambientLight intensity={0.3} />
      <SunLight />
      <PerfProbe />

      {/* District: outdoor */}
      <group name="district-outdoor">
        <Environment />
      </group>

      {/* District: office */}
      <group name="district-office">
        <HQBuilding />
      </group>

      {/* District: research (Fase 2) */}
      <group name="district-research">
        <ResearchBuilding />
      </group>

      {/* District: residential (Fase 2) */}
      <group name="district-residential">
        <Apartments />
      </group>

      {/* District: recreation */}
      <group name="district-recreation">
        <Pool />
        <FootballField />
      </group>

      {/* District: social */}
      <group name="district-social">
        <Cafe />
      </group>

      {/* AgentAvatar[] — World-level siblings, NOT Room children.
          ?noagents skips the layer so static-campus draw calls can be
          measured in isolation (Fase 2 perf criterion). */}
      {!noAgents && <AgentLayer />}

      {/* Phase 6: user-added editor objects (decorative overlay layer) */}
      <EditorLayer />

      <CameraRig />
    </>
  )
}
