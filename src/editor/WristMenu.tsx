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
import { togglePlaceCity, toggleRays, toggleSurface } from './xrInput'
import { toggleOcclusion, useOcclusion } from '../xr/occlusion'
import { useWorld } from '../world/store'
import { usePlacement } from '../xr/placement'
import { useSelection } from './selection'
import { openPalettePage, togglePalette, usePaletteUI } from '../xr/paletteUI'
import { HAPTIC, pulse } from '../xr/haptics'
import { deleteSelected, duplicateSelected } from './Obstacles'

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
/** Width of a third-of-the-row button (for buttons passed in from outside, like Mocap). */
export const WRIST_THIRD = (W - GAP * 2) / 3
/** Width of a quarter-of-the-row button. */
export const WRIST_QUARTER = (W - GAP * 3) / 4

/** Where the menu is this frame, so hand gestures can ignore a hand that is using it. */
export const wristMenuState = { visible: false, position: new THREE.Vector3() }

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
export function WristMenu({ extra, envRow }: { extra?: ReactNode; envRow?: ReactNode }) {
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
    wristMenuState.visible = p.visible
    if (tipDot.current) tipDot.current.visible = p.visible
    if (!p.visible) {
      for (const b of registry) b.down = false
      return
    }
    // Float just off the palm, a little toward the head, and face you.
    p.position.copy(wristPos).addScaledVector(palm, 0.07).addScaledVector(toHead, 0.02)
    p.lookAt(headPos)
    p.updateMatrixWorld()
    wristMenuState.position.copy(p.position)

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
        <MenuContent extra={extra} envRow={envRow} />
      </group>
    </PokeRegistry.Provider>
  )
}

function MenuContent({ extra, envRow }: { extra?: ReactNode; envRow?: ReactNode }) {
  const { rays, snap, worldScale, surface, gestures, occlusion } = useEditor()
  const occlusionSrc = useOcclusion((s) => s.source)
  const set = useEditor((s) => s.set)
  const group = useSelection((s) => s.ids.length)
  const tool = useWorld((s) => s.tool)
  const placing = usePlacement((s) => s.status === 'choosing')
  const paletteHidden = usePaletteUI((s) => s.hidden)
  const guideOpen = useGuide((s) => s.open)
  const toggleGuide = useGuide((s) => s.toggleGuide)
  const rowY = (i: number) => 0.05 - i * (BTN_H + GAP)
  const quarter = (W - GAP * 3) / 4
  const third = (W - GAP * 2) / 3
  const col = (i: number, w: number) => -W / 2 + w / 2 + i * (w + GAP)
  // Rows: 0 toggles · 1 scale · 2 tools · 3 view · 4 environments · (5 group) · status line.
  const statusRow = group > 0 ? 6 : 5
  const top = 0.082
  const bottom = rowY(statusRow) - 0.012
  return (
    <group>
      <mesh position={[0, (top + bottom) / 2, -0.004]} raycast={() => null}>
        <planeGeometry args={[W + 0.02, top - bottom]} />
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
      <MenuButton position={[col(0, quarter), rowY(0), 0]} width={quarter} label={`Rays ${rays ? 'on' : 'off'}`} active={rays} onPress={toggleRays} />
      <MenuButton position={[col(1, quarter), rowY(0), 0]} width={quarter} label={`Snap ${snap ? 'on' : 'off'}`} active={snap} onPress={() => set({ snap: !snap })} />
      <MenuButton position={[col(2, quarter), rowY(0), 0]} width={quarter} label={surface === 'real' ? 'Real' : 'Virtual'} active={surface === 'real'} onPress={toggleSurface} />
      <MenuButton position={[col(3, quarter), rowY(0), 0]} width={quarter} label={`Occl. ${occlusion ? 'on' : 'off'}`} active={occlusion} onPress={toggleOcclusion} />
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
      {/* Tools: Assets places from the asset library (pick one on the Control Palette's Assets page). */}
      <MenuButton position={[col(0, quarter), rowY(2), 0]} width={quarter} label="Select" active={tool === 'select'} onPress={() => useWorld.getState().setTool('select')} />
      <MenuButton
        position={[col(1, quarter), rowY(2), 0]}
        width={quarter}
        label="Assets"
        active={tool === 'asset'}
        onPress={() => {
          useWorld.getState().setTool('asset')
          openPalettePage('Assets')
        }}
      />
      <MenuButton position={[col(2, quarter), rowY(2), 0]} width={quarter} label={placing ? 'Cancel' : 'Place'} active={placing} onPress={togglePlaceCity} />
      <MenuButton position={[col(3, quarter), rowY(2), 0]} width={quarter} label={guideOpen ? 'Close' : 'Guide'} active={guideOpen} onPress={toggleGuide} />
      <MenuButton position={[col(0, quarter), rowY(3), 0]} width={quarter} label="Recenter" onPress={recenterWorld} />
      <MenuButton position={[col(1, quarter), rowY(3), 0]} width={quarter} label={paletteHidden ? 'Palette' : 'Hide pal.'} active={!paletteHidden} onPress={togglePalette} />
      <MenuButton position={[col(2, quarter), rowY(3), 0]} width={quarter} label={`Gest. ${gestures ? 'on' : 'off'}`} active={gestures} onPress={() => set({ gestures: !gestures })} />
      {extra && <group position={[col(3, quarter), rowY(3), 0]}>{extra}</group>}
      {envRow && <group position={[0, rowY(4), 0]}>{envRow}</group>}
      {/* Framed group (frame-hands gesture): act on all of it. */}
      {group > 0 && (
        <>
          <MenuButton position={[col(0, third), rowY(5), 0]} width={third} label="Duplicate" onPress={duplicateSelected} />
          <MenuButton position={[col(1, third), rowY(5), 0]} width={third} label="Delete" onPress={deleteSelected} />
          <MenuButton position={[col(2, third), rowY(5), 0]} width={third} label={`Clear (${group})`} onPress={() => useSelection.getState().clear()} />
        </>
      )}
      <Text position={[0, rowY(statusRow) + 0.004, 0]} fontSize={0.008} color={FORGE.copper} anchorX="center" anchorY="middle" raycast={() => null}>
        {`${SCALE_PRESETS[worldScale].label} · occlusion: ${occlusionSrc === 'none' ? 'no depth or room' : occlusionSrc} · Guide for help`}
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
    pulse('active', HAPTIC.press)
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
