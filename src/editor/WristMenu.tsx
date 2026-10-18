import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { XRSpace, useXRInputSourceState } from '@react-three/xr'
import { SCALE_IDS, SCALE_PRESETS, recenterWorld } from '../scene/worldRoot'
import { FORGE } from '../theme/forge'
import { BrandLogo3D } from '../xr/BrandLogo3D'
import { useGuide } from '../guide/guideStore'
import { useEditor } from './settings'
import { toggleRays, toggleSurface } from './xrInput'
import { SCALE_SHORT } from './toolbar'

/** Panel size in metres (real room size, independent of the world scale). */
const W = 0.16
const BTN_H = 0.026
const BTN_D = 0.008
const GAP = 0.006
/** How directly the palm (or controller top) must face your head before the menu shows. */
const FACING = 0.55
/** Fingertip press: within this far in front of a button's face (m). Release once it backs off past RELEASE. */
const TOUCH = 0.008
const RELEASE = 0.018
/** Extra margin around a button's face for the fingertip test (m). */
const EDGE = 0.003
/** Ignore repeat presses this soon after one. */
const PRESS_COOLDOWN_MS = 350

const palm = new THREE.Vector3()
const toHead = new THREE.Vector3()
const wristPos = new THREE.Vector3()
const headPos = new THREE.Vector3()
const wristQuat = new THREE.Quaternion()
const tipPos = new THREE.Vector3()
const local = new THREE.Vector3()

/**
 * One frame of the fingertip test for a button, with the tip in button-local space (face at z = +depth/2).
 * Presses when the tip reaches the face (within TOUCH in front, up to 3 cm pushed through) inside its
 * outline; stays down until the tip leaves the outline or backs off past RELEASE (hysteresis).
 */
export function pokeStep(tipLocal: THREE.Vector3, width: number, wasDown: boolean): { down: boolean; pressed: boolean } {
  const inFace = Math.abs(tipLocal.x) <= width / 2 + EDGE && Math.abs(tipLocal.y) <= BTN_H / 2 + EDGE
  const depth = tipLocal.z - BTN_D / 2 // distance in front of the face (negative = pushed in)
  const touching = inFace && depth <= TOUCH && depth >= -0.03
  if (touching && !wasDown) return { down: true, pressed: true }
  if (wasDown && (!inFace || depth > RELEASE)) return { down: false, pressed: false }
  return { down: wasDown, pressed: false }
}

/** A button the fingertip can press: its frame (button-local space, face at z = +depth/2) and size. */
interface Pokeable {
  frame: THREE.Object3D
  width: number
  press: () => void
  /** Fingertip is currently pressing it (needs to back off before it can press again). */
  down: boolean
}
const PokeRegistry = createContext<Set<Pokeable> | null>(null)

/**
 * In-XR settings on your left wrist: turn your left palm toward your face and poke the buttons with
 * your right index finger (or press them with the right controller). With controllers, tilt the
 * top of the left controller toward you. Size is in real metres, so it works at every world scale.
 *
 * Fingertip presses are detected here directly from the right index-finger-tip joint (a cyan dot shows
 * it while the menu is open), not through XR pointer events, so they don't depend on touch-pointer
 * thresholds. Controllers (and rays) still press through pointer events.
 */
export function WristMenu({ extra }: { extra?: ReactNode }) {
  const hand = useXRInputSourceState('hand', 'left')
  const controller = useXRInputSourceState('controller', 'left')
  const rightHand = useXRInputSourceState('hand', 'right')
  const space = hand?.inputSource.hand.get('wrist') ?? controller?.inputSource.gripSpace
  const tipSpace = rightHand?.inputSource.hand.get('index-finger-tip')
  const anchor = useRef<THREE.Object3D>(null)
  const tip = useRef<THREE.Object3D>(null)
  const tipDot = useRef<THREE.Mesh>(null)
  const panel = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera)
  const registry = useMemo(() => new Set<Pokeable>(), [])
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
    if (tipDot.current) tipDot.current.visible = p.visible
    if (!p.visible) {
      for (const b of registry) b.down = false
      return
    }
    // Float just off the palm, a little toward the head, and face you.
    p.position.copy(wristPos).addScaledVector(palm, 0.07).addScaledVector(toHead, 0.02)
    p.lookAt(headPos)
    p.updateMatrixWorld()

    // Fingertip presses: the right index tip touching a button's front face.
    const t = tip.current
    if (!t) return
    t.getWorldPosition(tipPos)
    for (const b of registry) {
      local.copy(tipPos)
      b.frame.worldToLocal(local)
      const next = pokeStep(local, b.width, b.down)
      b.down = next.down
      if (next.pressed) b.press()
    }
  })

  if (!space) return null
  return (
    <PokeRegistry.Provider value={registry}>
      <XRSpace space={space} ref={anchor} />
      {tipSpace && (
        <XRSpace space={tipSpace} ref={tip}>
          <mesh ref={tipDot} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.005, 12, 8]} />
            <meshBasicMaterial color={FORGE.tip} depthTest={false} transparent opacity={0.9} />
          </mesh>
        </XRSpace>
      )}
      <group ref={panel} visible={false}>
        <MenuContent extra={extra} />
      </group>
    </PokeRegistry.Provider>
  )
}

function MenuContent({ extra }: { extra?: ReactNode }) {
  const { rays, snap, worldScale, surface } = useEditor()
  const set = useEditor((s) => s.set)
  const guideOpen = useGuide((s) => s.open)
  const toggleGuide = useGuide((s) => s.toggleGuide)
  const rowY = (i: number) => 0.05 - i * (BTN_H + GAP)
  const quarter = (W - GAP * 3) / 4
  const half = (W - GAP) / 2
  const third = (W - GAP * 2) / 3
  const col = (i: number, w: number) => -W / 2 + w / 2 + i * (w + GAP)
  return (
    <group>
      <mesh position={[0, -0.01, -0.004]} raycast={() => null}>
        <planeGeometry args={[W + 0.02, 0.19]} />
        <meshBasicMaterial color={FORGE.panel} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.068, -0.0035]} raycast={() => null}>
        <planeGeometry args={[0.028, 0.004]} />
        <meshBasicMaterial color={FORGE.ember} transparent opacity={0.95} />
      </mesh>
      <BrandLogo3D position={[-0.042, 0.068, 0]} size={0.016} />
      <Text position={[0.008, 0.068, 0]} fontSize={0.011} color={FORGE.text} anchorX="center" anchorY="middle" raycast={() => null}>
        RealmForge
      </Text>
      <MenuButton position={[col(0, third), rowY(0), 0]} width={third} label={rays ? 'See-thru' : 'Opaque'} active={rays} onPress={toggleRays} />
      <MenuButton position={[col(1, third), rowY(0), 0]} width={third} label={snap ? 'Grid on' : 'Free'} active={snap} onPress={() => set({ snap: !snap })} />
      <MenuButton position={[col(2, third), rowY(0), 0]} width={third} label={surface === 'real' ? 'Real fl.' : 'Virt. fl.'} active={surface === 'real'} onPress={toggleSurface} />
      {SCALE_IDS.map((id, i) => (
        <MenuButton
          key={id}
          position={[col(i, quarter), rowY(1), 0]}
          width={quarter}
          label={SCALE_SHORT[id]}
          active={worldScale === id}
          onPress={() => set({ worldScale: id })}
        />
      ))}
      <MenuButton position={[col(0, half), rowY(2), 0]} width={half} label="Recenter" onPress={recenterWorld} />
      <MenuButton
        position={[col(1, half), rowY(2), 0]}
        width={half}
        label={guideOpen ? 'Close guide' : 'Guide'}
        active={guideOpen}
        onPress={toggleGuide}
      />
      {extra && <group position={[col(0, W), rowY(3), 0]}>{extra}</group>}
      <Text position={[0, rowY(4) + 0.004, 0]} fontSize={0.008} color={FORGE.copper} anchorX="center" anchorY="middle" raycast={() => null}>
        {`${SCALE_PRESETS[worldScale].label} · Guide opens help`}
      </Text>
    </group>
  )
}

/**
 * A wrist-menu button. Right-fingertip presses come from WristMenu's own joint test; controller grabs and
 * rays come through pointer events (pointer *down*: XR touch pointers only emit `click` for quick pokes).
 * Both share one cooldown, so a single press can't fire twice.
 */
export function MenuButton(props: {
  position?: [number, number, number]
  width?: number
  label: string
  active?: boolean
  onPress: () => void
}) {
  const width = props.width ?? (W - GAP) / 2
  const registry = useContext(PokeRegistry)
  const frame = useRef<THREE.Group>(null)
  const body = useRef<THREE.Mesh>(null)
  const last = useRef(0)
  const onPress = useRef(props.onPress)
  onPress.current = props.onPress

  const press = () => {
    const now = performance.now()
    if (now - last.current < PRESS_COOLDOWN_MS) return
    last.current = now
    onPress.current()
  }

  useEffect(() => {
    if (!registry || !frame.current) return
    const entry: Pokeable = { frame: frame.current, width, press, down: false }
    registry.add(entry)
    return () => {
      registry.delete(entry)
    }
    // press reads refs only, so registering once per size is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, width])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    press()
  }
  // Brief press feedback: the button sinks for the cooldown.
  useFrame(() => {
    if (body.current) body.current.scale.z = performance.now() - last.current < PRESS_COOLDOWN_MS ? 0.4 : 1
  })
  return (
    <group ref={frame} position={props.position}>
      <mesh ref={body} onPointerDown={onDown}>
        <boxGeometry args={[width, BTN_H, BTN_D]} />
        <meshStandardMaterial
          color={props.active ? FORGE.ember : FORGE.panelMuted}
          emissive={props.active ? FORGE.emberHot : '#000000'}
          emissiveIntensity={props.active ? 0.35 : 0}
        />
      </mesh>
      <Text
        position={[0, 0, BTN_D / 2 + 0.0005]}
        fontSize={0.0095}
        color={props.active ? FORGE.ink : FORGE.text}
        anchorX="center"
        anchorY="middle"
        raycast={() => null}
      >
        {props.label}
      </Text>
    </group>
  )
}
