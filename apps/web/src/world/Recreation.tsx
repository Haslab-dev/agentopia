import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAFE, FIELD, POOL_EDGE } from './layout'
import { Instanced, PlantSet, RoundTableSet } from './instancing'

// Recreation district: swimming pool with animated water + mini football
// field. Social district: a small café building (interior is Phase 2).

export function Pool() {
  const water = useRef<THREE.Mesh>(null!)
  useFrame(({ clock }) => {
    if (water.current) {
      water.current.position.y = 0.42 + Math.sin(clock.elapsedTime * 1.6) * 0.035
      const m = water.current.material as THREE.MeshStandardMaterial
      m.opacity = 0.78 + Math.sin(clock.elapsedTime * 2.3) * 0.06
    }
  })
  const cx = POOL_EDGE[0] + 3
  const cz = POOL_EDGE[1] - 4
  return (
    <group>
      <mesh position={[cx, 0.12, cz]} receiveShadow>
        <boxGeometry args={[17, 0.24, 13]} />
        <meshStandardMaterial color="#e9dfca" roughness={0.85} />
      </mesh>
      <mesh ref={water} position={[cx, 0.42, cz]}>
        <boxGeometry args={[14.5, 0.12, 10.5]} />
        <meshStandardMaterial color="#5fb2d9" transparent opacity={0.82} roughness={0.1} />
      </mesh>
      {/* lane lines (one instanced call) */}
      <Instanced
        items={[-4.5, -1.5, 1.5, 4.5].map((dz) => ({
          pos: [cx, 0.5, cz + dz] as [number, number, number],
          scale: [14.5, 0.02, 0.12] as [number, number, number],
        }))}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#ffffff"
        transparent
        opacity={0.5}
        castShadow={false}
      />
      {/* lounge chairs + umbrella */}
      {[-3.5, 0.5].map((dz, i) => (
        <group key={i} position={[cx - 10.5, 0, cz + dz]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.3, 0]} rotation={[0.5, 0, 0]} castShadow>
            <boxGeometry args={[0.8, 0.08, 2]} />
            <meshStandardMaterial color="#f5efe4" />
          </mesh>
          <mesh position={[1.2, 1.1, 0]}>
            <coneGeometry args={[1.5, 0.5, 10]} />
            <meshStandardMaterial color="#f59e4c" />
          </mesh>
          <mesh position={[1.2, 0.55, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.1, 6]} />
            <meshStandardMaterial color="#55524c" />
          </mesh>
        </group>
      ))}
      <PlantSet floor={0} spots={[{ pos: [cx + 10.5, cz - 7.5] }, { pos: [cx + 10.5, cz + 7.5] }]} />
    </group>
  )
}

export function FootballField() {
  const [cx, cz] = FIELD
  return (
    <group>
      <mesh position={[cx, 0.05, cz]} receiveShadow>
        <boxGeometry args={[30, 0.07, 19]} />
        <meshStandardMaterial color="#5f9e6e" roughness={1} />
      </mesh>
      {/* lines + goals (two instanced calls) */}
      <Instanced
        items={[
          { pos: [cx, 0.1, cz] as [number, number, number], scale: [0.25, 0.02, 19] as [number, number, number] },
          ...[-9.35, 9.35].map((dz) => ({ pos: [cx, 0.1, cz + dz] as [number, number, number], scale: [30, 0.02, 0.25] as [number, number, number] })),
          ...[-14.85, 14.85].map((dx) => ({ pos: [cx + dx, 0.1, cz] as [number, number, number], scale: [0.25, 0.02, 19] as [number, number, number] })),
        ]}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#ffffff"
        castShadow={false}
      />
      <mesh position={[cx, 0.1, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.6, 2.85, 24]} />
        <meshStandardMaterial color="#ffffff" side={2} />
      </mesh>
      <Instanced
        items={[-15.5, 15.5].flatMap((dx) => [
          { pos: [cx + dx, 1.1, cz - 2.6] as [number, number, number], scale: [0.15, 2.2, 0.15] as [number, number, number] },
          { pos: [cx + dx, 1.1, cz + 2.6] as [number, number, number], scale: [0.15, 2.2, 0.15] as [number, number, number] },
          { pos: [cx + dx, 2.2, cz] as [number, number, number], scale: [0.15, 0.15, 5.35] as [number, number, number] },
        ])}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        color="#f5efe4"
      />
      {/* ball */}
      <mesh position={[cx + 3, 0.35, cz + 2]} castShadow>
        <sphereGeometry args={[0.35, 14, 14]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
    </group>
  )
}

export function Cafe() {
  const [cx, cz] = CAFE
  return (
    <group>
      <mesh position={[cx, 1.5, cz]} castShadow receiveShadow>
        <boxGeometry args={[11, 3, 8]} />
        <meshStandardMaterial color="#faf6ef" roughness={0.9} />
      </mesh>
      <mesh position={[cx, 1.7, cz + 4.05]}>
        <boxGeometry args={[9, 2, 0.08]} />
        <meshStandardMaterial color="#bcd9ea" transparent opacity={0.4} roughness={0.1} />
      </mesh>
      <mesh position={[cx, 3.25, cz]} castShadow>
        <boxGeometry args={[12, 0.35, 9]} />
        <meshStandardMaterial color="#e5d9c3" />
      </mesh>
      <mesh position={[cx, 3.75, cz + 3.2]}>
        <boxGeometry args={[5, 0.7, 0.3]} />
        <meshStandardMaterial color="#f59e4c" emissive="#f59e4c" emissiveIntensity={0.3} />
      </mesh>
      {/* outdoor tables (instanced) */}
      <RoundTableSet floor={0} umbrella spots={[[-4, 7], [1, 8], [6, 7]].map(([dx, dz]) => [cx + dx, cz + dz] as [number, number])} />
      <PlantSet floor={0} spots={[{ pos: [cx - 7, cz + 3] }, { pos: [cx + 7.5, cz + 3] }]} />
    </group>
  )
}
