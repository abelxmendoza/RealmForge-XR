import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { getAttendeeRuntime, tickAttendee, useAttendee } from './attendee'

/** Simple capsule-style virtual attendee driven by the event simulation. */
export function Attendee() {
  const group = useRef<THREE.Group>(null)
  const phase = useAttendee((s) => s.phase)

  useFrame((_, dt) => {
    tickAttendee(dt)
    const g = group.current
    if (!g) return
    const live = useAttendee.getState().phase
    const running = useAttendee.getState().running
    g.visible = running && live !== 'idle'
    const r = getAttendeeRuntime()
    g.position.set(r.pos[0], 0, r.pos[1])
    g.rotation.y = r.heading
  })

  if (!useAttendee.getState().running && phase === 'idle') return null

  return (
    <group ref={group}>
      {/* Capsule body (cylinder + spheres — avoids CapsuleGeometry edge cases). */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.7, 12]} />
        <meshStandardMaterial color="#4dabf7" roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#4dabf7" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#4dabf7" roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#ffe8cc" />
      </mesh>
    </group>
  )
}

/** Thin path ribbon for the attendee's remaining route. */
export function AttendeeRoute() {
  const phase = useAttendee((s) => s.phase)
  const path = getAttendeeRuntime().path
  const target = getAttendeeRuntime().target
  if (phase !== 'walking' && phase !== 'serving') return null
  const pts = path.slice(Math.max(0, target - 1))
  if (pts.length < 2) return null
  return (
    <group>
      {pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1]!
        const mx = (a[0] + b[0]) / 2
        const mz = (a[1] + b[1]) / 2
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const yaw = Math.atan2(b[0] - a[0], b[1] - a[1])
        return (
          <mesh key={i} position={[mx, 0.04, mz]} rotation={[-Math.PI / 2, 0, -yaw]} raycast={() => null}>
            <planeGeometry args={[0.12, len]} />
            <meshBasicMaterial color="#4dabf7" transparent opacity={0.55} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}
