import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { XRSpace, useXRInputSourceState } from '@react-three/xr'
import { SCALE_IDS, SCALE_PRESETS, recenterWorld } from '../scene/worldRoot'
import { useEditor } from './settings'
import { toggleRays } from './xrInput'

/** Panel size in metres (real room size, independent of the world scale). */
const W = 0.16
const BTN_H = 0.026
const GAP = 0.006
/** How directly the palm (or controller top) must face your head before the menu shows. */
const FACING = 0.55

const palm = new THREE.Vector3()
const toHead = new THREE.Vector3()
const wristPos = new THREE.Vector3()
const headPos = new THREE.Vector3()
const wristQuat = new THREE.Quaternion()

/**
 * In-XR settings on your left wrist: turn your left palm toward your face and poke the buttons with
 * your right index finger (or press them with the right controller). With controllers, tilt the
 * top of the left controller toward you. Size is in real metres, so it works at every world scale.
 */
export function WristMenu({ extra }: { extra?: ReactNode }) {
  const hand = useXRInputSourceState('hand', 'left')
  const controller = useXRInputSourceState('controller', 'left')
  const space = hand?.inputSource.hand.get('wrist') ?? controller?.inputSource.gripSpace
  const anchor = useRef<THREE.Object3D>(null)
  const panel = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  // Palm normal is the joint's −Y (WebXR hand spec); for a controller use its top (+Y).
  const normalY = hand ? -1 : 1

  useFrame(() => {
    const a = anchor.current
    const p = panel.current
    if (!a || !p) return
    a.getWorldPosition(wristPos)
    a.getWorldQuaternion(wristQuat)
    camera.getWorldPosition(headPos)
    palm.set(0, normalY, 0).applyQuaternion(wristQuat)
    toHead.copy(headPos).sub(wristPos).normalize()
    p.visible = palm.dot(toHead) > FACING
    if (!p.visible) return
    // Float just off the palm, a little toward the head, and face you.
    p.position.copy(wristPos).addScaledVector(palm, 0.07).addScaledVector(toHead, 0.02)
    p.lookAt(headPos)
  })

  if (!space) return null
  return (
    <>
      <XRSpace space={space} ref={anchor} />
      <group ref={panel} visible={false}>
        <MenuContent extra={extra} />
      </group>
    </>
  )
}

function MenuContent({ extra }: { extra?: ReactNode }) {
  const { rays, snap, worldScale } = useEditor()
  const set = useEditor((s) => s.set)
  const rowY = (i: number) => 0.05 - i * (BTN_H + GAP)
  const quarter = (W - GAP * 3) / 4
  const half = (W - GAP) / 2
  const col = (i: number, w: number) => -W / 2 + w / 2 + i * (w + GAP)
  return (
    <group>
      <mesh position={[0, 0.005, -0.004]}>
        <planeGeometry args={[W + 0.02, 0.15]} />
        <meshBasicMaterial color="#141a24" transparent opacity={0.85} />
      </mesh>
      <Text position={[0, 0.068, 0]} fontSize={0.011} color="#e8eaed" anchorX="center" anchorY="middle">
        RealmForge
      </Text>
      <MenuButton position={[col(0, half), rowY(0), 0]} width={half} label={`Rays ${rays ? 'on' : 'off'}`} active={rays} onPress={toggleRays} />
      <MenuButton position={[col(1, half), rowY(0), 0]} width={half} label={`Snap ${snap ? 'on' : 'off'}`} active={snap} onPress={() => set({ snap: !snap })} />
      {SCALE_IDS.map((id, i) => (
        <MenuButton
          key={id}
          position={[col(i, quarter), rowY(1), 0]}
          width={quarter}
          label={SCALE_PRESETS[id].label.split(' ').pop()!}
          active={worldScale === id}
          onPress={() => set({ worldScale: id })}
        />
      ))}
      <MenuButton position={[col(0, half), rowY(2), 0]} width={half} label="Recenter" onPress={recenterWorld} />
      {extra && <group position={[col(1, half), rowY(2), 0]}>{extra}</group>}
      <Text position={[0, rowY(3) + 0.004, 0]} fontSize={0.008} color="#9aa4ad" anchorX="center" anchorY="middle">
        {`${SCALE_PRESETS[worldScale].label} · palm toward you to show`}
      </Text>
    </group>
  )
}

/** A pokeable button. Works with fingertip touch, controller grab and (if on) rays. */
export function MenuButton(props: {
  position?: [number, number, number]
  width?: number
  label: string
  active?: boolean
  onPress: () => void
}) {
  const width = props.width ?? (W - GAP) / 2
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    props.onPress()
  }
  return (
    <group position={props.position}>
      <mesh onClick={onClick}>
        <boxGeometry args={[width, BTN_H, 0.008]} />
        <meshStandardMaterial color={props.active ? '#f4a261' : '#2d3748'} emissive={props.active ? '#f4a261' : '#000'} emissiveIntensity={0.25} />
      </mesh>
      <Text position={[0, 0, 0.0045]} fontSize={0.0095} color={props.active ? '#1d2433' : '#e8eaed'} anchorX="center" anchorY="middle" raycast={() => null}>
        {props.label}
      </Text>
    </group>
  )
}
