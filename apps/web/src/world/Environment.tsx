import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { FOUNTAIN, PLAZA } from './layout'
import { Instanced, type Xf } from './instancing'

// Outdoor district: island terrain, roads, plaza + fountain, lake, instanced
// trees & street lamps, benches, simple procedural cars.

const TREE_SPOTS: [number, number][] = (() => {
  const out: [number, number][] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 46; i++) {
    const x = -72 + rnd() * 144
    const z = -48 + rnd() * 96
    // keep clear of HQ footprint, plaza, pool, field, roads
    if (x > -44 && x < 4 && z > -30 && z < 6) continue
    if (Math.hypot(x - PLAZA[0], z - PLAZA[1]) < 12) continue
    if (x > 22 && x < 46 && z > -30 && z < -8) continue
    if (x > -50 && x < -18 && z > 10 && z < 32) continue
    // Fase 2 buildings: research (x 2..26, z -42..-26) + apartments (x -71..-41, z -14..-2)
    if (x > -2 && x < 30 && z > -46 && z < -22) continue
    if (x > -74 && x < -38 && z > -17 && z < 1) continue
    if (Math.abs(z - 32) < 5 || Math.abs(x - 52) < 5) continue
    out.push([x, z])
  }
  return out
})()

const LAMP_SPOTS: [number, number][] = [
  [-30, 27], [-4, 27], [22, 27], [44, 27], [-30, 37], [22, 37],
  [47, -20], [47, 8], [57, -20], [57, 8], [8, 4], [26, 4],
]

function InstancedTrees() {
  const trunkRef = useRef<THREE.InstancedMesh>(null!)
  const leafRef = useRef<THREE.InstancedMesh>(null!)
  const leaf2Ref = useRef<THREE.InstancedMesh>(null!)
  const mats = useMemo(() => TREE_SPOTS.map(([x, z], i) => {
    const s = 0.8 + ((i * 37) % 10) / 22
    return { x, z, s }
  }), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const half = Math.ceil(mats.length / 2)
    mats.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 1.1 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s))
      trunkRef.current.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(t.x, (2.2 + 0.9) * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s))
      if (i < half) leafRef.current.setMatrixAt(i, m)
      else leaf2Ref.current.setMatrixAt(i - half, m)
    })
    trunkRef.current.count = mats.length
    leafRef.current.count = half
    leaf2Ref.current.count = mats.length - half
    trunkRef.current.instanceMatrix.needsUpdate = true
    leafRef.current.instanceMatrix.needsUpdate = true
    leaf2Ref.current.instanceMatrix.needsUpdate = true
  }, [mats])
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, mats.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 2.2, 7]} />
        <meshStandardMaterial color="#8a6b4f" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, mats.length]} castShadow>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshStandardMaterial color="#5f9e6e" roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={leaf2Ref} args={[undefined, undefined, mats.length]} castShadow>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial color="#74ac72" roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  )
}

function InstancedLamps() {
  const postRef = useRef<THREE.InstancedMesh>(null!)
  const bulbRef = useRef<THREE.InstancedMesh>(null!)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    LAMP_SPOTS.forEach(([x, z], i) => {
      m.makeTranslation(x, 1.9, z)
      postRef.current.setMatrixAt(i, m)
      m.makeTranslation(x, 3.9, z)
      bulbRef.current.setMatrixAt(i, m)
    })
    postRef.current.instanceMatrix.needsUpdate = true
    bulbRef.current.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      <instancedMesh ref={postRef} args={[undefined, undefined, LAMP_SPOTS.length]}>
        <cylinderGeometry args={[0.07, 0.09, 3.8, 8]} />
        <meshStandardMaterial color="#55524c" />
      </instancedMesh>
      <instancedMesh ref={bulbRef} args={[undefined, undefined, LAMP_SPOTS.length]}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#ffe3ae" emissive="#ffca7a" emissiveIntensity={0.7} />
      </instancedMesh>
    </group>
  )
}

function Fountain() {
  const water = useRef<THREE.Mesh>(null!)
  const jet = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (water.current) water.current.position.y = 0.52 + Math.sin(t * 2) * 0.03
    if (jet.current) {
      const s = 1 + Math.sin(t * 5) * 0.08
      jet.current.scale.set(s, 1 + Math.sin(t * 3.2) * 0.12, s)
    }
  })
  return (
    <group position={[FOUNTAIN[0], 0, FOUNTAIN[1]]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.4, 3.7, 0.6, 24]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.8} />
      </mesh>
      <mesh ref={water} position={[0, 0.52, 0]}>
        <cylinderGeometry args={[3.05, 3.05, 0.1, 24]} />
        <meshStandardMaterial color="#7fb3e0" transparent opacity={0.85} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.3, 0.45, 0.9, 12]} />
        <meshStandardMaterial color="#e9dfca" />
      </mesh>
      <mesh ref={jet} position={[0, 1.8, 0]}>
        <coneGeometry args={[0.35, 1.1, 10, 1, true]} />
        <meshStandardMaterial color="#a8d8f0" transparent opacity={0.55} side={2} />
      </mesh>
    </group>
  )
}

const CARS: { pos: [number, number]; rotY: number; color: string }[] = [
  { pos: [36, 13], rotY: 0.2, color: '#e0654f' },
  { pos: [41, 18], rotY: -0.1, color: '#7fb3e0' },
  { pos: [45, 12.5], rotY: 0.05, color: '#f5efe4' },
]

/** All parked cars as 3 instanced parts (bodies w/ per-instance colour,
    cabins, wheels) — 3 draw calls instead of 18 meshes. */
function InstancedCars() {
  const bodies: Xf[] = CARS.map((c) => ({ pos: [c.pos[0], 0.55, c.pos[1]], rotY: c.rotY, scale: [3.6, 0.65, 1.7] }))
  const cabins: Xf[] = CARS.map((c) => {
    const s = Math.sin(c.rotY)
    const co = Math.cos(c.rotY)
    return { pos: [c.pos[0] - 0.2 * co, 1.1, c.pos[1] + 0.2 * s], rotY: c.rotY, scale: [1.9, 0.55, 1.55] as [number, number, number] }
  })
  const wheels: Xf[] = []
  for (const c of CARS) {
    const s = Math.sin(c.rotY)
    const co = Math.cos(c.rotY)
    for (const [lx, lz] of [[-1.25, -0.85], [1.25, -0.85], [-1.25, 0.85], [1.25, 0.85]] as const) {
      wheels.push({
        pos: [c.pos[0] + lx * co + lz * s, 0.32, c.pos[1] - lx * s + lz * co],
        rotX: Math.PI / 2,
        rotY: c.rotY,
        scale: [1, 1, 1],
      })
    }
  }
  return (
    <group>
      <Instanced items={bodies} geometry={<boxGeometry args={[1, 1, 1]} />} color="#ffffff" colors={CARS.map((c) => c.color)} roughness={0.35} metalness={0.4} />
      <Instanced items={cabins} geometry={<boxGeometry args={[1, 1, 1]} />} color="#bcd9ea" roughness={0.1} metalness={0.2} />
      <Instanced items={wheels} geometry={<cylinderGeometry args={[0.32, 0.32, 0.2, 12]} />} color="#2c2a26" castShadow={false} />
    </group>
  )
}

export function Environment() {
  return (
    <group>
      {/* island terrain */}
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <boxGeometry args={[160, 1.1, 118]} />
        <meshStandardMaterial color="#79b06f" roughness={1} />
      </mesh>
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[150, 0.06, 108]} />
        <meshStandardMaterial color="#83ba77" roughness={1} />
      </mesh>
      {/* water around the island */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#6fa8cf" roughness={0.3} />
      </mesh>

      {/* roads + sidewalks (one instanced call, per-instance colour) */}
      <Instanced
        items={[
          { pos: [0, 0.05, 32] as [number, number, number], scale: [150, 0.06, 6.5] as [number, number, number] },
          { pos: [52, 0.05, 0] as [number, number, number], scale: [6.5, 0.06, 108] as [number, number, number] },
          { pos: [0, 0.06, 27.6] as [number, number, number], scale: [150, 0.05, 1.6] as [number, number, number] },
          { pos: [0, 0.06, 36.4] as [number, number, number], scale: [150, 0.05, 1.6] as [number, number, number] },
        ]}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#ffffff"
        colors={['#4c4a46', '#4c4a46', '#ddd3bd', '#ddd3bd']}
        roughness={0.95}
        castShadow={false}
        receiveShadow
      />

      {/* plaza */}
      <mesh position={[PLAZA[0], 0.06, PLAZA[1]]} receiveShadow>
        <cylinderGeometry args={[10.5, 10.5, 0.08, 36]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.9} />
      </mesh>
      <Fountain />
      {/* benches (instanced: 2 calls) */}
      <Instanced
        items={[[-6, 6], [6, 6], [-6, -7], [7, -6]].map(([dx, dz], i) => ({
          pos: [PLAZA[0] + dx, 0.45, PLAZA[1] + dz] as [number, number, number],
          rotY: i * 1.2,
          scale: [2, 0.09, 0.55] as [number, number, number],
        }))}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#b08968"
      />
      <Instanced
        items={[[-6, 6], [6, 6], [-6, -7], [7, -6]].map(([dx, dz], i) => ({
          pos: [PLAZA[0] + dx, 0.22, PLAZA[1] + dz] as [number, number, number],
          rotY: i * 1.2,
          scale: [1.8, 0.45, 0.08] as [number, number, number],
        }))}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#8a6b4f"
        castShadow={false}
      />

      {/* lake + mini bridge */}
      <mesh position={[-56, 0.04, -34]} receiveShadow>
        <cylinderGeometry args={[11, 11, 0.07, 28]} />
        <meshStandardMaterial color="#7fb3e0" roughness={0.2} />
      </mesh>
      <mesh position={[-56, 0.35, -34]} rotation={[0, 0, 0]}>
        <boxGeometry args={[16, 0.18, 2.2]} />
        <meshStandardMaterial color="#b08968" />
      </mesh>

      {/* parking + cars */}
      <mesh position={[40, 0.05, 16]} receiveShadow>
        <boxGeometry args={[16, 0.06, 12]} />
        <meshStandardMaterial color="#5d5a55" />
      </mesh>
      <InstancedCars />

      <InstancedTrees />
      <InstancedLamps />
    </group>
  )
}
