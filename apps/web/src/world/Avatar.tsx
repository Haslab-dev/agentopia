import { useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { AgentDef } from '@living-world/shared-types'
import { AGENT_DEFS } from '../agent-client/demoAgents'
import { getRuntime } from '../state/agentRuntime'
import { useUiStore, useWorldStore } from '../state/stores'
import { insideAnyBuilding } from './layout'
import { zoneVisible } from './instancing'

// Procedural avatar kit (ARCHITECTURE.md §5): shared capsule/sphere geometry,
// variation via material colour. Poses are procedural keyframes in code,
// blended with exponential damping — no external GLB, no AnimationMixer yet
// (mixer arrives with GLB rigs in later phases; noted in README).
//
// Scene-graph rule (§2.1): avatars are World-level siblings, never Room
// children. This layer is rendered directly under <World>.

const STATUS_COLOR: Record<string, string> = {
  working: '#5f9e6e', thinking: '#e8b93d', meeting: '#7fb3e0',
  celebrating: '#f59e4c', error: '#e0654f', walking: '#9db38a',
  leisure: '#6ec3c9', idle: '#b8b2a4', paused: '#8a8578',
}

interface PoseTargets {
  legL: number; legR: number; armL: number; armR: number
  armLz: number; armRz: number; headX: number; headY: number; bodyY: number
}

const BASE: PoseTargets = {
  legL: 0, legR: 0, armL: 0, armR: 0, armLz: 0.08, armRz: -0.08,
  headX: 0, headY: 0, bodyY: 0,
}

function poseTargets(pose: string, phase: number, t: number): PoseTargets {
  const s = Math.sin(phase * Math.PI * 2)
  switch (pose) {
    case 'walk':
      return { ...BASE, legL: s * 0.55, legR: -s * 0.55, armL: -s * 0.4, armR: s * 0.4, bodyY: Math.abs(Math.sin(phase * Math.PI * 2)) * 0.05 }
    case 'sit':
      return { ...BASE, legL: -1.5, legR: -1.5, armL: -0.7, armR: -0.7, bodyY: -0.44 }
    case 'typing':
      return { ...BASE, legL: -1.5, legR: -1.5, armL: -1.12 + Math.sin(t * 11) * 0.05, armR: -1.12 + Math.cos(t * 13) * 0.06, headX: 0.14, bodyY: -0.44 }
    case 'thinking':
      return { ...BASE, legL: -1.5, legR: -1.5, armL: -0.7, armR: -2.35, headX: -0.06, bodyY: -0.44 }
    case 'talking':
      return { ...BASE, legL: -1.5, legR: -1.5, armL: -0.7, armR: -0.9 + Math.sin(t * 3.2) * 0.25, headX: Math.sin(t * 5) * 0.05, bodyY: -0.44 }
    case 'celebrate':
      return { ...BASE, armL: -0.4, armR: -0.4, armLz: 2.5, armRz: -2.5, bodyY: Math.abs(Math.sin(t * 6)) * 0.22 }
    case 'error':
      return { ...BASE, headY: Math.sin(t * 9) * 0.22, armL: 0.15, armR: 0.15 }
    case 'sleep':
      return { ...BASE, headX: 0.38, armL: 0.05, armR: 0.05, bodyY: Math.sin(t * 1.4) * 0.012 }
    default: // stand
      return { ...BASE, armL: Math.sin(t * 1.6) * 0.04, armR: -Math.sin(t * 1.6) * 0.04, bodyY: Math.sin(t * 1.6) * 0.012 }
  }
}

function AvatarView({ def }: { def: AgentDef }) {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const legL = useRef<THREE.Group>(null!)
  const legR = useRef<THREE.Group>(null!)
  const armL = useRef<THREE.Group>(null!)
  const armR = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const status = useWorldStore((s) => s.agents.find((a) => a.id === def.id)?.status ?? 'idle')
  const selected = useUiStore((s) => s.selectedAgentId === def.id)
  const selectAgent = useUiStore((s) => s.selectAgent)
  const focusOn = useUiStore((s) => s.focusOn)
  const [badge, setBadge] = useState<string | null>(null)
  const badgeRef = useRef<string | null>(null)
  // Phase 5: simulated small-talk bubble (renderer only — text comes from
  // the simulation layer and is labelled "simulasi"; never real speech).
  const [chat, setChat] = useState<string | null>(null)
  const chatRef = useRef<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plateRef = useRef<any>(null)

  useFrame(({ clock }, dt) => {
    const rt = getRuntime(def.id)
    if (!rt || !root.current) return
    root.current.position.set(rt.pos[0], rt.y, rt.pos[1])
    // Fase 2 floor selection (§2.2): an avatar on an HQ floor above the
    // selected one is hidden together with its floor.
    root.current.visible = zoneVisible(rt.building, rt.floor, useUiStore.getState().hqFloor)
    root.current.rotation.y = THREE.MathUtils.damp(root.current.rotation.y, rt.heading, 12, dt)
    const tg = poseTargets(rt.pose, rt.phase, clock.elapsedTime)
    const k = 1 - Math.exp(-dt * 11)
    const apply = (g: THREE.Group | null, x?: number, z?: number) => {
      if (!g) return
      if (x !== undefined) g.rotation.x += (x - g.rotation.x) * k
      if (z !== undefined) g.rotation.z += (z - g.rotation.z) * k
    }
    apply(legL.current, tg.legL)
    apply(legR.current, tg.legR)
    apply(armL.current, tg.armL, tg.armLz)
    apply(armR.current, tg.armR, tg.armRz)
    if (head.current) {
      head.current.rotation.x += (tg.headX - head.current.rotation.x) * k
      head.current.rotation.y += (tg.headY - head.current.rotation.y) * k
    }
    if (body.current) body.current.position.y += (tg.bodyY - body.current.position.y) * k
    const b = rt.badge ?? (rt.pose === 'thinking' ? '💭' : rt.pose === 'celebrate' ? '🎉' : null)
    if (b !== badgeRef.current) {
      badgeRef.current = b
      setBadge(b)
    }
    if (rt.chat !== chatRef.current) {
      chatRef.current = rt.chat
      setChat(rt.chat)
    }
    // Nameplates are DOM overlays (no depth test): fade them out while the
    // agent is indoors under a closed roof, so nobody appears to stand on
    // it — and while its HQ floor is hidden by the floor selector.
    if (plateRef.current) {
      const ui = useUiStore.getState()
      const roofClosed = !ui.hideRoof
      const hidden =
        (roofClosed && insideAnyBuilding(rt.pos)) ||
        !zoneVisible(rt.building, rt.floor, ui.hqFloor)
      plateRef.current.style.opacity = hidden ? '0' : '1'
    }
  })

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation()
        selectAgent(def.id)
        const rt = getRuntime(def.id)
        if (rt) focusOn([rt.pos[0], rt.y, rt.pos[1]])
      }}
    >
      {/* status ring */}
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[selected ? 0.62 : 0.5, selected ? 0.78 : 0.62, 24]} />
        <meshBasicMaterial color={STATUS_COLOR[status] ?? '#b8b2a4'} transparent opacity={selected ? 0.95 : 0.6} side={2} />
      </mesh>
      <group ref={body}>
        {/* legs */}
        {([legL, legR] as const).map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.14 : 0.14, 0.98, 0]}>
            <mesh position={[0, -0.44, 0]} castShadow>
              <boxGeometry args={[0.19, 0.9, 0.22]} />
              <meshStandardMaterial color={def.pants} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.9, 0.06]}>
              <boxGeometry args={[0.2, 0.1, 0.34]} />
              <meshStandardMaterial color="#3a3733" />
            </mesh>
          </group>
        ))}
        {/* torso */}
        <mesh position={[0, 1.32, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.5, 6, 12]} />
          <meshStandardMaterial color={def.shirt} roughness={0.85} />
        </mesh>
        {/* arms */}
        {([armL, armR] as const).map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.38 : 0.38, 1.56, 0]}>
            <mesh position={[0, -0.3, 0]} castShadow>
              <boxGeometry args={[0.14, 0.62, 0.15]} />
              <meshStandardMaterial color={def.shirt} roughness={0.85} />
            </mesh>
            <mesh position={[0, -0.64, 0]}>
              <sphereGeometry args={[0.075, 8, 8]} />
              <meshStandardMaterial color={def.skin} />
            </mesh>
          </group>
        ))}
        {/* head + hair */}
        <group ref={head} position={[0, 1.86, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.215, 18, 16]} />
            <meshStandardMaterial color={def.skin} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.075, -0.02]} scale={[1.04, 0.72, 1.04]}>
            <sphereGeometry args={[0.215, 18, 16]} />
            <meshStandardMaterial color={def.hair} roughness={0.95} />
          </mesh>
        </group>
      </group>
      {/* simulated chat bubble — generic lines invented by the life
          simulation, explicitly tagged so they can't pass as real speech */}
      {chat && (
        <Html position={[0, 3.05, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-2xl rounded-bl-sm bg-white/92 px-2.5 py-1 text-[10.5px] font-medium text-ink shadow-md">
            {chat}
            <span className="ml-1.5 rounded bg-sand px-1 py-px text-[8px] font-bold uppercase tracking-wide text-ink/55">simulasi</span>
          </div>
        </Html>
      )}
      {/* nameplate */}
      <Html ref={plateRef} position={[0, 2.42, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none', transition: 'opacity 0.3s' }}>
        <div className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] ?? '#ccc' }} />
          {def.name}
          {badge && <span>{badge}</span>}
        </div>
      </Html>
    </group>
  )
}

export function AgentLayer() {
  return (
    <group>
      {AGENT_DEFS.map((def) => (
        <AvatarView key={def.id} def={def} />
      ))}
    </group>
  )
}
