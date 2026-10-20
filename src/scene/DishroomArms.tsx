import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { useEnvironment } from '../world/environment'
import { useWorld } from '../world/store'

/**
 * Lightweight procedural, illustrative robot arms.
 * The visual follows editable orange pedestal objects in the shared world.
 * Not a URDF, IK solver, collision checker, or safety-rated motion planner.
 */
function Arm({ position, phase }: { position: [number, number, number]; phase: number }) {
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.65 + phase
    if (shoulder.current) shoulder.current.rotation.y = Math.sin(t) * 0.6
    if (elbow.current) elbow.current.rotation.z = -0.35 + Math.sin(t * 0.85) * 0.28
    if (wrist.current) wrist.current.rotation.z = Math.sin(t * 1.2) * 0.22
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 0.18, 12]} />
        <meshStandardMaterial color="#263c4a" metalness={0.65} roughness={0.35} />
      </mesh>
      <group ref={shoulder} position={[0, 0.18, 0]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.2]} />
          <meshStandardMaterial color="#e7a75c" metalness={0.35} roughness={0.4} />
        </mesh>
        <group ref={elbow} position={[0, 0.7, 0]}>
          <mesh position={[0.33, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.66, 10]} />
            <meshStandardMaterial color="#b8c9d2" metalness={0.65} roughness={0.3} />
          </mesh>
          <group ref={wrist} position={[0.66, 0, 0]}>
            <mesh><sphereGeometry args={[0.13, 10, 8]} /><meshStandardMaterial color="#263c4a" /></mesh>
            <mesh position={[0.15, 0, -0.09]}><boxGeometry args={[0.3, 0.045, 0.045]} /><meshStandardMaterial color="#dde5e8" /></mesh>
            <mesh position={[0.15, 0, 0.09]}><boxGeometry args={[0.3, 0.045, 0.045]} /><meshStandardMaterial color="#dde5e8" /></mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

export function DishroomArms() {
  const active = useEnvironment((s) => s.activeId)
  const objects = useWorld((s) => s.objects)
  if (active !== 'robotic-dishroom') return null
  const pedestals = Object.values(objects).filter(
    (o) => o.kind === 'platform' && o.color === '#e7a75c' && o.size[0] === 0.65,
  )
  return (
    <group>
      {pedestals.map((o, i) => (
        <Arm key={o.id} position={[o.position[0], o.position[1] + o.size[1], o.position[2]]} phase={i * 1.4} />
      ))}
    </group>
  )
}
