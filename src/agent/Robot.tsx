import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { WORLD } from '../world/types'
import { markArrived, robotRuntime, useNav } from '../nav/navigation'

const TURN_RATE = 8

/** A small primitive robot that walks the current route and turns to face where it is going. */
export function Robot() {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const bubble = useRef<THREE.Group>(null)

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    dt = Math.min(dt, 0.1)
    const { path, status } = useNav.getState()
    const pos = robotRuntime.pos

    let moving = false
    // 'paused' keeps the path but freezes the robot (multi-waypoint Play / Pause).
    if (status === 'moving' && robotRuntime.target < path.length) {
      let budget = WORLD.robotSpeed * dt
      while (budget > 0 && robotRuntime.target < path.length) {
        const [tx, tz] = path[robotRuntime.target]
        const dx = tx - pos[0]
        const dz = tz - pos[1]
        const dist = Math.hypot(dx, dz)
        if (dist > 1e-4) {
          const desired = Math.atan2(dx, dz)
          robotRuntime.heading = lerpAngle(robotRuntime.heading, desired, Math.min(1, TURN_RATE * dt))
        }
        if (dist <= budget) {
          pos[0] = tx
          pos[1] = tz
          budget -= dist
          robotRuntime.target++
        } else {
          pos[0] += (dx / dist) * budget
          pos[1] += (dz / dist) * budget
          budget = 0
        }
      }
      moving = true
      if (robotRuntime.target >= path.length) markArrived()
    }

    g.position.set(pos[0], 0, pos[1])
    g.rotation.y = robotRuntime.heading
    if (body.current) {
      const t = state.clock.elapsedTime
      body.current.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.08 : 0
    }
    if (bubble.current) {
      const since = performance.now() - useNav.getState().blockedAt
      bubble.current.visible = since < 1800
    }
  })

  return (
    <group ref={group}>
      <group ref={body}>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[0.6, 0.5, 0.5]} />
          <meshStandardMaterial color="#f4f1de" />
        </mesh>
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[0.42, 0.32, 0.36]} />
          <meshStandardMaterial color="#e07a5f" />
        </mesh>
        {/* Eyes face +z, the direction of travel. */}
        <mesh position={[-0.1, 0.84, 0.185]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        <mesh position={[0.1, 0.84, 0.185]}>
          <sphereGeometry args={[0.05, 10, 8]} />
          <meshBasicMaterial color="#111" />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2]} />
          <meshStandardMaterial color="#333" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshStandardMaterial color="#81b29a" emissive="#81b29a" emissiveIntensity={0.8} />
        </mesh>
      </group>
      <group ref={bubble} visible={false} position={[0, 2, 0]}>
        {/* "!" alert built from primitives, so nothing has to load a font at the venue. */}
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.16, 0.5, 0.16]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <sphereGeometry args={[0.1, 12, 8]} />
          <meshBasicMaterial color="#ffd166" />
        </mesh>
      </group>
    </group>
  )
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}
