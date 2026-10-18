import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'

const noHit = () => {}

/**
 * Children that rays, pokes and the mouse go straight through (the robot, the simulated attendee): they
 * have nothing to click, and without this they swallow presses meant for the ground or objects behind them.
 * `pointerEvents="none"` covers XR pointers; the no-op raycast covers the desktop mouse.
 */
export function PassThrough({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  // Children mount and unmount (the attendee appears when the simulation runs), so re-apply each frame.
  useFrame(() => {
    group.current?.traverse((o) => {
      if (o.raycast !== noHit) o.raycast = noHit
    })
  })
  return (
    <group ref={group} pointerEvents="none">
      {children}
    </group>
  )
}
