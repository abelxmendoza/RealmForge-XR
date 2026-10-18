import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { XRSpace, useXRInputSourceState } from '@react-three/xr'
import { recenterWorld } from '../scene/worldRoot'
import { FORGE } from '../theme/forge'
import { useGuide } from '../guide/guideStore'
import { useEditor } from './settings'
import { toggleRays } from './xrInput'
import { toggleOcclusion, useOcclusion } from '../xr/occlusion'
import { toggleRealSurfaces } from '../xr/realSurfaces'
import { useRoom } from '../xr/room'
import { useSelection } from './selection'
import { useWorld } from '../world/store'
import { backPage, summonPalette, toggleAllPanels, togglePalette, usePaletteUI } from '../xr/paletteUI'
import { exitXR } from '../xr/session'
import { XRPanel, type PanelHandle } from '../xr/panel/XRPanel'
import type { ButtonItem, PanelSpec } from '../xr/panel/layout'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { executeVoiceCommand } from '../voice/commandExecutor'
import { voiceConfirm, VOICE_OPTIONS } from '../voice/sharedConfirm'
import { useVoiceCommands } from '../voice/useVoiceCommands'

/** The wrist panel is laid out at 300 CSS px and shown 0.2 m wide: small, but every button is a finger wide. */
const WIDTH_PX = 300
const WRIST_MPP = 0.2 / WIDTH_PX
/** How directly the palm must face your head before the menu shows. */
const FACING = 0.55
/**
 * Controllers: a resting, forward-pointing controller already "faces" you (its grip's up tilts back ~45°),
 * which used to pop the menu up over the palette all the time. So a controller has to be raised to chest
 * height and turned clearly toward your face; or press Y to pin the menu open (Y again unpins it).
 */
const CONTROLLER_FACING = 0.92
const CONTROLLER_RAISE = 0.45
/** Fingertip press: within this far in front of the panel (m). Release once it backs off past RELEASE. */
const TOUCH = 0.008
const RELEASE = 0.018
/** Pointer id for fingertip pokes (distinct from XR pointer ids, which are small positive numbers). */
const TIP_POINTER = -100

/** Where the menu is this frame, so hand gestures can ignore a hand that is using it. */
export const wristMenuState = { visible: false, position: new THREE.Vector3() }

/**
 * One frame of the fingertip test against the panel's plane (tip in panel-local metres, face at z = 0).
 * Presses when the tip reaches the face (within TOUCH in front, up to 3 cm pushed through) over a control;
 * stays down until the tip leaves the control or backs off past RELEASE (hysteresis), so one poke is one press.
 */
export function pokeStep(depth: number, overControl: boolean, wasDown: boolean): { down: boolean; pressed: boolean } {
  const touching = overControl && depth <= TOUCH && depth >= -0.03
  if (touching && !wasDown) return { down: true, pressed: true }
  if (wasDown && (!overControl || depth > RELEASE)) return { down: false, pressed: false }
  return { down: wasDown, pressed: false }
}

const palm = new THREE.Vector3()
const toHead = new THREE.Vector3()
const wristPos = new THREE.Vector3()
const headPos = new THREE.Vector3()
const wristQuat = new THREE.Quaternion()
const tipPos = new THREE.Vector3()
const local = new THREE.Vector3()

/**
 * Quick controls on your left wrist: turn your left palm toward your face (or tilt the top of the left
 * controller toward you) and poke with your right index finger, or point a ray. It is the way back from
 * anywhere: Menu, Hide all, Back, Home and Exit are always here, whatever the palette is showing.
 */
export function WristMenu() {
  const hand = useXRInputSourceState('hand', 'left')
  const controller = useXRInputSourceState('controller', 'left')
  const rightHand = useXRInputSourceState('hand', 'right')
  const space = hand?.inputSource.hand.get('wrist') ?? controller?.inputSource.gripSpace
  const tipSpace = rightHand?.inputSource.hand.get('index-finger-tip')
  const anchor = useRef<THREE.Object3D>(null)
  const tip = useRef<THREE.Object3D>(null)
  const tipDot = useRef<THREE.Mesh>(null)
  const panel = useRef<THREE.Group>(null)
  const handle = useRef<PanelHandle | null>(null)
  const tipDown = useRef(false)
  const pinned = useRef(false)
  const yWas = useRef(false)
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
    let visible: boolean
    if (hand) visible = palm.dot(toHead) > FACING
    else {
      // Y (left controller button 5) pins the menu, unless it's busy deleting a held object (editor/Obstacles).
      const y = !!controller?.inputSource.gamepad?.buttons[5]?.pressed
      if (y && !yWas.current && !useWorld.getState().dragging) pinned.current = !pinned.current
      yWas.current = y
      visible = pinned.current || (palm.dot(toHead) > CONTROLLER_FACING && headPos.y - wristPos.y < CONTROLLER_RAISE)
    }
    if (p.visible !== visible) p.visible = visible
    wristMenuState.visible = visible
    if (tipDot.current) tipDot.current.visible = visible
    if (!visible) {
      if (tipDown.current) handle.current?.release(TIP_POINTER)
      tipDown.current = false
      return
    }
    // Float just off the palm, a little toward the head, and face you.
    p.position.copy(wristPos).addScaledVector(palm, 0.07).addScaledVector(toHead, 0.02)
    p.lookAt(headPos)
    p.updateMatrixWorld()
    wristMenuState.position.copy(p.position)

    // Fingertip presses: the right index tip touching a control on the panel's face.
    const t = tip.current
    const h = handle.current
    if (!t || !h) return
    t.getWorldPosition(tipPos)
    local.copy(tipPos)
    p.worldToLocal(local)
    const hit = h.hitLocal(local.x, local.y)
    const next = pokeStep(local.z, !!hit && !hit.handle, tipDown.current)
    if (next.pressed && hit) h.press(hit.id, TIP_POINTER)
    if (tipDown.current && !next.down) h.release(TIP_POINTER)
    tipDown.current = next.down
  })

  if (!space) return null
  return (
    <>
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
        <WristPanel handle={handle} />
      </group>
    </>
  )
}

const b = (id: string, label: string, extra: Partial<ButtonItem> = {}): ButtonItem => ({ type: 'button', id, label, ...extra })
const lit = (on: boolean): Partial<ButtonItem> => (on ? { variant: 'on' } : {})

/** The wrist menu's content (pure, so it is unit-tested). */
export function wristSpec(s: {
  rays: boolean
  snap: boolean
  occlusion: boolean
  realSurfaces: boolean
  paletteOpen: boolean
  guideOpen: boolean
  listening: boolean
  group: number
  status: string
}): PanelSpec {
  return {
    width: WIDTH_PX,
    gap: 6,
    cards: [
      {
        type: 'card',
        tone: 'brand',
        padding: 8,
        gap: 6,
        blocks: [
          {
            type: 'row',
            items: [
              { type: 'logo', size: 18 },
              { type: 'text', text: 'RealmForge', font: 'display', size: 15, weight: 800, flex: 1 },
              b('exit', 'Exit VR', { variant: 'primary', width: 'auto' }),
            ],
          },
          { type: 'grid', columns: 3, rowHeight: 34, gap: 5, items: [
            b('menu', 'Menu', { ...lit(s.paletteOpen), align: 'center' }),
            b('hide-all', 'Hide all', { align: 'center' }),
            b('guide', 'Guide', { ...lit(s.guideOpen), align: 'center' }),
            b('back', '‹ Back', { align: 'center' }),
            b('home', 'Home', { align: 'center' }),
            b('mic', s.listening ? 'Stop mic' : 'Mic', { ...lit(s.listening), align: 'center' }),
            b('center', 'Recenter', { align: 'center' }),
            b('select', 'Select', { align: 'center' }),
          ] },
          { type: 'grid', columns: 4, rowHeight: 30, gap: 5, items: [
            b('rays', 'Rays', { ...lit(s.rays), align: 'center' }),
            b('snap', 'Snap', { ...lit(s.snap), align: 'center' }),
            b('occlusion', 'Occl.', { ...lit(s.occlusion), align: 'center' }),
            b('surfaces', 'Surf.', { ...lit(s.realSurfaces), align: 'center' }),
          ] },
          ...(s.group > 0
            ? [{ type: 'grid' as const, columns: 3, rowHeight: 30, gap: 5, items: [
                b('group:copy', 'Copy', { align: 'center' }),
                b('group:delete', 'Delete', { variant: 'danger', align: 'center' }),
                b('group:clear', `Clear ${s.group}`, { align: 'center' }),
              ] }]
            : []),
          { type: 'row', items: [{ type: 'text', text: s.status, size: 10.5, color: 'copper', align: 'center', flex: 1 }] },
        ],
      },
    ],
  }
}

function WristPanel({ handle }: { handle: { current: PanelHandle | null } }) {
  const { rays, snap, worldScale, occlusion, realSurfaces } = useEditor()
  const occlusionSrc = useOcclusion((s) => s.source)
  const roomPlanes = useRoom((s) => s.planes + s.meshes)
  const group = useSelection((s) => s.ids.length)
  const paletteOpen = usePaletteUI((s) => !s.closed && !s.hidden)
  const guideOpen = useGuide((s) => s.open)
  const voice = useVoiceCommands(VOICE_OPTIONS)
  const status = [
    worldScale === 'life' ? '1:1' : worldScale === 'large' ? '1:4' : worldScale === 'room' ? '1:20' : '1:60',
    `occl ${occlusionSrc === 'none' ? 'no room' : occlusionSrc}`,
    roomPlanes ? `room ${roomPlanes}` : 'room: not set up',
  ].join(' · ')

  const actions: Record<string, () => unknown> = useMemo(
    () => ({
      exit: () => exitXR(),
      menu: togglePalette,
      'hide-all': toggleAllPanels,
      guide: () => useGuide.getState().toggleGuide(),
      mic: () => (voice.isListening ? voice.stopListening() : voice.startListening()),
      // Back steps the palette back a page; if it's closed, it opens it where you left off.
      back: () => (usePaletteUI.getState().closed ? summonPalette() : backPage()),
      home: () => executeVoiceCommand({ type: 'GO_HOME' }, { confirm: voiceConfirm }),
      center: recenterWorld,
      select: () => useWorld.getState().setTool('select'),
      rays: toggleRays,
      snap: () => useEditor.getState().set({ snap: !useEditor.getState().snap }),
      occlusion: toggleOcclusion,
      surfaces: toggleRealSurfaces,
      'group:copy': duplicateSelected,
      'group:delete': deleteSelected,
      'group:clear': () => useSelection.getState().clear(),
    }),
    [voice],
  )

  const spec = wristSpec({ rays, snap, occlusion, realSurfaces, paletteOpen, guideOpen, listening: voice.isListening, group, status })
  return <XRPanel name="wrist" spec={spec} onPress={(id) => actions[id]?.()} handleRef={handle} metersPerPx={WRIST_MPP} anchor="center" />
}
