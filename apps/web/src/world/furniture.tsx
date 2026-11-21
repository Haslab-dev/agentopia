// Procedural furniture that is NOT instanced: one-off pieces and the two
// real point lights. Everything repeated (desks, chairs, plants, sofas,
// pods, beds) lives in instancing.tsx as InstancedMesh sets (§2.4) — the
// Fase 1 per-mesh Desk/Plant components were removed in Fase 2 because
// 11 meshes per desk made the <150 draw-call budget unreachable.

export const WOOD = '#b08968'

export function PendantLamp({ pos }: { pos: [number, number] }) {
  return (
    <group position={[pos[0], 0, pos[1]]}>
      <mesh position={[0, 3.55, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
        <meshStandardMaterial color="#55524c" />
      </mesh>
      <mesh position={[0, 3.28, 0]}>
        <coneGeometry args={[0.32, 0.28, 12, 1, true]} />
        <meshStandardMaterial color="#f59e4c" side={2} />
      </mesh>
      <pointLight position={[0, 3.05, 0]} intensity={6} distance={9} color="#ffd9a0" />
    </group>
  )
}
