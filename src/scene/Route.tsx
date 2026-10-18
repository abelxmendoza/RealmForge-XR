import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, Text } from '@react-three/drei'
import type * as THREE from 'three'
import { useWorld } from '../world/store'
import { useNav } from '../nav/navigation'
import { useRoutePlan } from '../nav/routePlan'
import type { Vec2 } from '../world/types'
import { useEditor } from '../editor/settings'
import { SCALE_PRESETS } from './worldRoot'

const Y = 0.08
const lift = (pts: Vec2[]) => pts.map(([x, z]) => [x, Y, z] as [number, number, number])
/**
 * Fat lines (drei Line → Line2) can't be ray-tested by XR pointers: they need a camera on the raycaster and
 * throw on every ray every frame (froze the app with rays on). They're decoration, so never hit-test them.
 */
const noHit = () => null

/** The robot's planned route, multi-waypoint stops, blocked preview, and the active goal flag. */
export function Route() {
  const path = useNav((s) => s.path)
  const status = useNav((s) => s.status)
  const blockedPath = useNav((s) => s.blockedPath)
  const blockedAt = useNav((s) => s.blockedAt)
  const goal = useWorld((s) => s.goal)
  const waypoints = useRoutePlan((s) => s.waypoints)
  const activeIndex = useRoutePlan((s) => s.activeIndex)
  const blockedRef = useRef<THREE.Group>(null)
  const flag = useRef<THREE.Group>(null)
  // The goal flag is 1.4 m tall; at small world scales it grows so it stays at least ~3 cm in the room.
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio
  const marker = Math.max(1, 0.03 / (1.4 * ratio))
  const showPath = path.length > 1 && (status === 'moving' || status === 'paused')
  const corridor = waypoints.length > 1 ? lift(waypoints) : null

  useFrame((state) => {
    if (blockedRef.current) blockedRef.current.visible = performance.now() - blockedAt < 1500
    if (flag.current) flag.current.rotation.y = state.clock.elapsedTime * 1.5
  })

  return (
    <>
      {corridor && <Line points={corridor} color="#ffd166" lineWidth={2} dashed dashSize={0.45} gapSize={0.25} raycast={noHit} />}
      {showPath && <Line points={lift(path)} color={status === 'paused' ? '#9bb7c9' : '#4cc9f0'} lineWidth={4} raycast={noHit} />}
      {blockedPath && blockedPath.length > 1 && (
        <group ref={blockedRef}>
          <Line points={lift(blockedPath)} color="#ef476f" lineWidth={3} dashed dashSize={0.3} gapSize={0.2} raycast={noHit} />
        </group>
      )}
      {waypoints.map((point, i) => {
        const active = i === activeIndex && !!goal
        const done = i < activeIndex
        return (
          <group key={`wp-${i}-${point[0]}-${point[1]}`} position={[point[0], 0, point[1]]} scale={marker * (active ? 1 : 0.72)}>
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noHit}>
              <ringGeometry args={[0.28, 0.48, 24]} />
              <meshBasicMaterial color={done ? '#6c8a9b' : active ? (status === 'no-path' ? '#ef476f' : '#06d6a0') : '#ffd166'} />
            </mesh>
            <Text position={[0, 0.55, 0]} fontSize={0.45} color="#fff" anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#111" raycast={noHit}>
              {String(i + 1)}
            </Text>
          </group>
        )
      })}
      {goal && waypoints.length === 0 && (
        <group position={[goal[0], 0, goal[1]]} scale={marker}>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.35, 0.55, 32]} />
            <meshBasicMaterial color={status === 'no-path' ? '#ef476f' : '#06d6a0'} />
          </mesh>
          <group ref={flag}>
            <mesh position={[0, 0.7, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 1.4]} />
              <meshStandardMaterial color="#ddd" />
            </mesh>
            <mesh position={[0.25, 1.2, 0]}>
              <boxGeometry args={[0.5, 0.3, 0.03]} />
              <meshStandardMaterial color="#06d6a0" />
            </mesh>
          </group>
        </group>
      )}
    </>
  )
}
