import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Handle } from '@react-three/handle'
import * as THREE from 'three'
import { HAPTIC, pulse } from '../haptics'
import { uiFontsReady } from '../../theme/fonts'
import { faceYaw } from './faceYaw'
import { canvasMeasure, drawPanel } from './draw'
import { hitTest, layoutPanel, type Hit, type PanelLayout, type PanelSpec } from './layout'
import { PressGate } from './pressGate'
import { METERS_PER_PX } from './constants'
import { panelRegistry, pressLog } from './registry'
import { XR_TEST_HOOKS } from '../../testHooks'

export { METERS_PER_PX }
/** Texture pixels per CSS px (sharp text at reading distance without huge textures). */
const TEXEL_SCALE = 2.5

/** For fingertip pokes (wrist menu): what's under a point given in the panel's local space (metres). */
export interface PanelHandle {
  layout: PanelLayout | null
  /** Panel-local metres (the XRPanel group's space) → the control there, or null. */
  hitLocal: (x: number, y: number) => Hit | null
  /** Press a control as if pointed at (runs the same gate, haptics and feedback). */
  press: (id: string, pointerId: number) => void
  release: (pointerId: number) => void
}

const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
const measure = measureCtx ? canvasMeasure(measureCtx) : (text: string, font: { size: number }) => text.length * font.size * 0.56

let logoImage: HTMLImageElement | null = null
const logoListeners = new Set<() => void>()
function loadLogo() {
  if (logoImage || typeof Image === 'undefined') return
  const img = new Image()
  img.onload = () => {
    logoImage = img
    logoListeners.forEach((l) => l())
  }
  img.src = `${import.meta.env.BASE_URL}brand/logo-64.png`
}

/**
 * A desktop-HUD-styled panel in XR: the whole panel is one canvas texture on one plane, laid out by
 * layout.ts and painted by draw.ts with the HUD's CSS values. The group origin is the panel's top centre,
 * so collapsing it keeps the title bar where it is.
 */
export function XRPanel({
  name,
  spec,
  onPress,
  moveTarget,
  handleRef,
  metersPerPx = METERS_PER_PX,
  anchor = 'top',
}: {
  /** Identifies the panel to the dev test registry (e2e tests aim at its buttons by id). */
  name: string
  spec: PanelSpec
  onPress: (id: string) => void
  /** The group a grab strip ('handle' item) moves; omit to make the strip inert. */
  moveTarget?: RefObject<THREE.Group | null>
  handleRef?: { current: PanelHandle | null }
  /** Real size of a CSS px (smaller for the wrist menu). */
  metersPerPx?: number
  /** Where the group origin sits on the panel: its top centre (default; collapsing keeps the title bar put) or its centre. */
  anchor?: 'top' | 'center'
}) {
  const gl = useThree((s) => s.gl)
  const [hover, setHover] = useState<ReadonlyMap<number, string>>(new Map())
  const [pressed, setPressed] = useState<string | null>(null)
  const [held, setHeld] = useState(false)
  const [fontsReady, setFontsReady] = useState(0)
  const [logoReady, setLogoReady] = useState(!!logoImage)
  const gate = useMemo(() => new PressGate(), [])
  const onPressRef = useRef(onPress)
  onPressRef.current = onPress

  useEffect(() => {
    loadLogo()
    const l = () => setLogoReady(true)
    logoListeners.add(l)
    let alive = true
    void uiFontsReady().then(() => alive && setFontsReady((n) => n + 1))
    return () => {
      alive = false
      logoListeners.delete(l)
      gate.reset()
    }
  }, [gate])

  const specKey = JSON.stringify(spec)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => layoutPanel(spec, measure), [specKey, fontsReady])

  // One canvas + texture per panel size; re-created only when the panel grows or shrinks.
  const surface = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(layout.width * TEXEL_SCALE))
    canvas.height = Math.max(1, Math.ceil(layout.height * TEXEL_SCALE))
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    texture.minFilter = THREE.LinearMipmapLinearFilter
    return { canvas, texture, ctx: canvas.getContext('2d') }
  }, [layout.width, layout.height, gl])
  useEffect(() => () => surface.texture.dispose(), [surface])

  const hoverIds = useMemo(() => new Set(hover.values()), [hover])
  useEffect(() => {
    if (!surface.ctx) return
    drawPanel(surface.ctx, layout, { hover: hoverIds, pressed, held, logo: logoReady ? logoImage : null }, TEXEL_SCALE)
    surface.texture.needsUpdate = true
  }, [surface, layout, hoverIds, pressed, held, logoReady])

  const w = layout.width * metersPerPx
  const h = layout.height * metersPerPx
  /** Height of the panel's top edge above the group origin. */
  const top = anchor === 'center' ? h / 2 : 0

  const fire = (id: string, pointerId: number) => {
    const hit = layout.hits.find((x) => x.id === id)
    if (!hit || hit.handle) return
    const accepted = gate.press(pointerId, performance.now()) && !hit.disabled
    if (XR_TEST_HOOKS) pressLog.push({ panel: name, id, pointerId, accepted })
    if (!accepted) return
    pulse('active', HAPTIC.press)
    setPressed(id)
    setTimeout(() => setPressed((p) => (p === id ? null : p)), 140)
    try {
      onPressRef.current(id)
    } catch (error) {
      console.error('[RealmForge] XR panel action failed', id, error)
    }
  }

  if (handleRef) {
    handleRef.current = {
      layout,
      hitLocal: (x, y) => hitTest(layout, x / metersPerPx + layout.width / 2, (top - y) / metersPerPx),
      press: fire,
      release: (pointerId) => gate.release(pointerId),
    }
  }

  const toPx = (e: ThreeEvent<PointerEvent>) => (e.uv ? { x: e.uv.x * layout.width, y: (1 - e.uv.y) * layout.height } : null)
  const setHoverFor = (pointerId: number, id: string | null) =>
    setHover((prev) => {
      if ((prev.get(pointerId) ?? null) === id) return prev
      const next = new Map(prev)
      if (id) next.set(pointerId, id)
      else next.delete(pointerId)
      return next
    })

  const handleNode = layout.hits.find((x) => x.handle)
  return (
    <group
      ref={(g) => {
        if (!XR_TEST_HOOKS) return
        if (g) panelRegistry.set(name, { group: g, layout, metersPerPx, top })
        else panelRegistry.delete(name)
      }}
    >
      <mesh
        position={[0, top - h / 2, 0]}
        onPointerMove={(e) => {
          e.stopPropagation()
          const p = toPx(e)
          const hit = p && hitTest(layout, p.x, p.y)
          setHoverFor(e.pointerId, hit && !hit.handle ? hit.id : null)
        }}
        onPointerLeave={(e) => {
          setHoverFor(e.pointerId, null)
          gate.release(e.pointerId)
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          const p = toPx(e)
          const hit = p && hitTest(layout, p.x, p.y)
          if (hit) fire(hit.id, e.pointerId)
          else {
            gate.hold(e.pointerId)
            if (XR_TEST_HOOKS) pressLog.push({ panel: name, id: `(empty ${p ? `${Math.round(p.x)},${Math.round(p.y)}` : 'no uv'})`, pointerId: e.pointerId, accepted: false })
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          gate.release(e.pointerId)
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={surface.texture} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {handleNode && moveTarget && (
        <PanelGrab target={moveTarget} rect={handleNode.rect} layout={layout} metersPerPx={metersPerPx} top={top} onHeld={setHeld} onHover={(on) => setHoverFor(-1, on ? handleNode.id : null)} />
      )}
    </group>
  )
}

const headPos = new THREE.Vector3()

/** Invisible grab area over the panel's grab strip. Moves `target`; it turns to face you on release. */
function PanelGrab({
  target,
  rect,
  layout,
  metersPerPx,
  top,
  onHeld,
  onHover,
}: {
  target: RefObject<THREE.Group | null>
  rect: { x: number; y: number; w: number; h: number }
  layout: PanelLayout
  metersPerPx: number
  top: number
  onHeld: (held: boolean) => void
  onHover: (on: boolean) => void
}) {
  const gl = useThree((s) => s.gl)
  const cx = (rect.x + rect.w / 2 - layout.width / 2) * metersPerPx
  const cy = top - (rect.y + rect.h / 2) * metersPerPx
  return (
    <Handle
      targetRef={target}
      rotate={false}
      scale={false}
      multitouch={false}
      apply={(state, obj) => {
        obj.position.copy(state.current.position)
        if (state.first) {
          onHeld(true)
          pulse('active', HAPTIC.grab)
        }
        if (state.last) {
          onHeld(false)
          gl.xr.getCamera().getWorldPosition(headPos)
          obj.rotation.set(0, faceYaw([obj.position.x, obj.position.z], [headPos.x, headPos.z]), 0)
          pulse('active', HAPTIC.place)
        }
      }}
    >
      <mesh position={[cx, cy, 0.002]} onPointerOver={() => onHover(true)} onPointerOut={() => onHover(false)}>
        <planeGeometry args={[rect.w * metersPerPx, rect.h * metersPerPx * 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </Handle>
  )
}
