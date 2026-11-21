import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useUiStore } from '../state/stores'
import { getRuntime } from '../state/agentRuntime'

// Camera modes (ARCHITECTURE.md §2.2): iso / orbit / top presets, click-focus
// flights, and follow-agent. OrbitControls provides drag-orbit, wheel-zoom,
// pan and basic touch gestures.
export function CameraRig() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null)
  const camera = useThree((s) => s.camera)
  const cameraMode = useUiStore((s) => s.cameraMode)
  const focusNonce = useUiStore((s) => s.focusNonce)
  const focusPoint = useUiStore((s) => s.focusPoint)
  const followAgent = useUiStore((s) => s.followAgent)
  const selectedAgentId = useUiStore((s) => s.selectedAgentId)
  const flight = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)

  useEffect(() => {
    const t = new THREE.Vector3(focusPoint[0], focusPoint[1], focusPoint[2])
    const off =
      cameraMode === 'top' ? new THREE.Vector3(0.5, 82, 0.5)
      : cameraMode === 'iso' ? new THREE.Vector3(42, 37, 42)
      : new THREE.Vector3(19, 13, 19)
    flight.current = { pos: t.clone().add(off), target: t }
  }, [cameraMode, focusNonce, focusPoint])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (followAgent && selectedAgentId) {
      const rt = getRuntime(selectedAgentId)
      if (rt) {
        const target = new THREE.Vector3(rt.pos[0], rt.y + 1, rt.pos[1])
        const delta = target.clone().sub(c.target).multiplyScalar(1 - Math.exp(-dt * 4))
        c.target.add(delta)
        camera.position.add(delta)
        c.update()
        return
      }
    }
    if (flight.current) {
      const k = 1 - Math.exp(-dt * 3.2)
      camera.position.lerp(flight.current.pos, k)
      c.target.lerp(flight.current.target, k)
      if (camera.position.distanceTo(flight.current.pos) < 0.4) flight.current = null
      c.update()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={5}
      maxDistance={170}
    />
  )
}
