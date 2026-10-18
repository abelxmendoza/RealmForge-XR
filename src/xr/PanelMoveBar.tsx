import { useState, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { Handle } from '@react-three/handle'
import * as THREE from 'three'
import { FORGE } from '../theme/forge'
import { HAPTIC, pulse } from './haptics'

/**
 * Yaw that turns a panel at `panel` so its front (+z) faces `head` (both [x, z] in the same space).
 * Pure, so it is unit-tested.
 */
export function faceYaw(panel: readonly [number, number], head: readonly [number, number]): number {
  return Math.atan2(head[0] - panel[0], head[1] - panel[1])
}

const head = new THREE.Vector3()

/**
 * A "Move" bar for a floating XR panel. Grab it with your hand or controller, or point a ray at it and
 * pull the trigger / pinch, then move it anywhere. The panel only translates while held, and turns to face
 * you on release. It stays where you put it until Recenter.
 */
export function PanelMoveBar({ target, y, width = 0.4 }: { target: RefObject<THREE.Group | null>; y: number; width?: number }) {
  const gl = useThree((s) => s.gl)
  const [hover, setHover] = useState(false)
  const [held, setHeld] = useState(false)
  return (
    <Handle
      targetRef={target}
      rotate={false}
      scale={false}
      multitouch={false}
      apply={(state, obj) => {
        obj.position.copy(state.current.position)
        if (state.first) {
          setHeld(true)
          pulse('active', HAPTIC.grab)
        }
        if (state.last) {
          setHeld(false)
          gl.xr.getCamera().getWorldPosition(head)
          obj.rotation.set(0, faceYaw([obj.position.x, obj.position.z], [head.x, head.z]), 0)
          pulse('active', HAPTIC.place)
        }
      }}
    >
      <group position={[0, y, 0.004]} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <mesh>
          <boxGeometry args={[width, 0.032, 0.012]} />
          <meshBasicMaterial color={held ? FORGE.emberActive : hover ? FORGE.hover : FORGE.panelMuted} toneMapped={false} />
        </mesh>
        <Text position={[0, 0, 0.007]} fontSize={0.016} color={FORGE.text} anchorX="center" anchorY="middle" raycast={() => null}>
          {held ? 'Moving… release to place' : 'Move: grab, or point and pull'}
        </Text>
      </group>
    </Handle>
  )
}
