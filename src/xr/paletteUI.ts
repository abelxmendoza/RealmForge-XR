import * as THREE from 'three'
import { create } from 'zustand'
import { getWebXRManager } from './session'

/**
 * Shared state for main's in-VR Control Palette, so the wrist menu can open / close it and open a page
 * (the wrist holds quick toggles; the palette holds the asset library, routes and saves).
 */
export interface PaletteUI {
  /** Collapsed to its title bar (tap the title to expand). */
  hidden: boolean
  /** Closed entirely (wrist Menu brings it back in front of you, like the guide). */
  closed: boolean
  /** Where it appears when (re)placed: off to your left (session start) or straight in front (summoned). */
  spot: 'side' | 'front'
  /** A page the palette should switch to (bumped `request` each time so the same page can be re-requested). */
  page: string | null
  request: number
  /** Bumped to re-place the palette in front of you. */
  recenter: number
}

export const usePaletteUI = create<PaletteUI>(() => ({ hidden: false, closed: false, spot: 'side', page: null, request: 0, recenter: 0 }))

export const setPaletteHidden = (hidden: boolean) => usePaletteUI.setState({ hidden })

/** Where the palette is this frame (tracking space), written by the palette itself. */
export const paletteAnchor = { position: new THREE.Vector3(), placed: false }

/**
 * Whether the palette should be brought to you rather than closed: it's more than `far` metres away, or
 * more than `fov` radians off where you're looking (behind you, or left behind when you walked off). Pure.
 */
export function shouldSummon(panel: THREE.Vector3Like, head: THREE.Vector3Like, forward: THREE.Vector3Like, far = 1.6, fov = 0.9): boolean {
  const dx = panel.x - head.x
  const dz = panel.z - head.z
  const dist = Math.hypot(dx, panel.y - head.y, dz)
  if (dist > far) return true
  const fl = Math.hypot(forward.x, forward.z)
  const pl = Math.hypot(dx, dz)
  if (fl < 1e-6 || pl < 1e-6) return false
  const cos = (forward.x * dx + forward.z * dz) / (fl * pl)
  return Math.acos(Math.max(-1, Math.min(1, cos))) > fov
}

const head = new THREE.Vector3()
const forward = new THREE.Vector3()

/** Bring the palette up in front of you. */
export function summonPalette() {
  const s = usePaletteUI.getState()
  usePaletteUI.setState({ closed: false, hidden: false, spot: 'front', recenter: s.recenter + 1 })
}

/**
 * Wrist **Menu**, like the guide: closed, collapsed, far away or behind you → appears in front of you;
 * already in front of you → closes.
 */
export function togglePalette() {
  const s = usePaletteUI.getState()
  if (s.closed || s.hidden || !paletteAnchor.placed) return summonPalette()
  const camera = getWebXRManager()?.getCamera()
  if (camera) {
    camera.getWorldPosition(head)
    camera.getWorldDirection(forward)
    if (shouldSummon(paletteAnchor.position, head, forward)) return summonPalette()
  }
  usePaletteUI.setState({ closed: true })
}

/** Show the palette in front of you on `page` (for example 'Assets'). */
export function openPalettePage(page: string) {
  const s = usePaletteUI.getState()
  usePaletteUI.setState({ closed: false, hidden: false, spot: 'front', page, request: s.request + 1, recenter: s.recenter + 1 })
}
