import * as THREE from 'three'
import { create } from 'zustand'
import { useGuide } from '../guide/guideStore'
import type { ToolbarSection } from '../editor/toolbar'
import { getWebXRManager } from './session'

/** Every page of the in-VR Control Palette: the six HUD sections plus their sub-pages. */
export type PalettePage =
  | ToolbarSection
  | 'assets' | 'events' | 'actors' | 'actor-settings' | 'brush' | 'saved' | 'styles' | 'room'
  | 'scans' | 'scan-align' | 'scan-display' | 'scan-measure'

const SECTIONS: readonly ToolbarSection[] = ['build', 'edit', 'plan', 'simulate', 'view', 'save']
export const isSection = (page: PalettePage): page is ToolbarSection => (SECTIONS as readonly string[]).includes(page)

/** Where Back goes from a sub-page opened directly (by voice or the wrist), with no history behind it. */
export const PAGE_PARENT: Partial<Record<PalettePage, PalettePage>> = {
  assets: 'build',
  events: 'build',
  actors: 'build',
  brush: 'build',
  'actor-settings': 'actors',
  saved: 'save',
  styles: 'view',
  room: 'view',
  scans: 'build',
  'scan-align': 'scans',
  'scan-display': 'scans',
  'scan-measure': 'scans',
}

export const PAGE_TITLE: Record<PalettePage, string> = {
  build: 'Build',
  edit: 'Edit',
  plan: 'Plan Routes',
  simulate: 'Simulate',
  view: 'View',
  save: 'Save',
  assets: 'Object catalog',
  events: 'Event objects',
  actors: 'Actors',
  'actor-settings': 'Actor settings',
  brush: 'Materials',
  saved: 'Saved worlds',
  styles: 'Styles',
  room: 'Real room',
  scans: 'Property scans',
  'scan-align': 'Align section',
  'scan-display': 'Display section',
  'scan-measure': 'Measure scale',
}

/**
 * Shared state for the in-VR Control Palette, so the palette, the wrist menu and voice commands all open,
 * collapse and navigate the same panel ("go back", "open the build page", "hide the menu").
 */
export interface PaletteUI {
  /** Collapsed to its title bar (Expand brings the rest back). */
  hidden: boolean
  /** Closed entirely (wrist Menu or "show menu" brings it back in front of you). */
  closed: boolean
  /** Where it appears when (re)placed: off to your left (session start) or straight in front (summoned). */
  spot: 'side' | 'front'
  /** Page history; the last entry is showing. Choosing a section tab starts a new history. */
  stack: PalettePage[]
  /** Bumped to re-place the palette in front of you. */
  recenter: number
}

export const usePaletteUI = create<PaletteUI>(() => ({ hidden: false, closed: false, spot: 'side', stack: ['build'], recenter: 0 }))

export const currentPage = (s: Pick<PaletteUI, 'stack'> = usePaletteUI.getState()): PalettePage => s.stack[s.stack.length - 1] ?? 'build'

export const setPaletteHidden = (hidden: boolean) => usePaletteUI.setState({ hidden })

/** Show `page`: a section tab starts fresh, a sub-page goes on top (so Back returns to where you were). */
export function openPage(page: PalettePage) {
  const { stack } = usePaletteUI.getState()
  if (isSection(page)) usePaletteUI.setState({ stack: [page] })
  else if (currentPage({ stack }) !== page) usePaletteUI.setState({ stack: [...stack, page] })
}

/** Back one page. Returns false when already on a top-level section (nothing to go back to). */
export function backPage(): boolean {
  const { stack } = usePaletteUI.getState()
  if (stack.length > 1) {
    usePaletteUI.setState({ stack: stack.slice(0, -1) })
    return true
  }
  const parent = PAGE_PARENT[currentPage({ stack })]
  if (!parent) return false
  usePaletteUI.setState({ stack: [parent] })
  return true
}

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

/** Close the palette (wrist Menu, "show menu" or a confirmation brings it back). */
export const closePalette = () => usePaletteUI.setState({ closed: true })

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
  closePalette()
}

/** Show the palette in front of you on `page`. */
export function openPalettePage(page: PalettePage) {
  openPage(page)
  summonPalette()
}

/**
 * Hide every floating panel (palette and guide), or bring the palette back if all are hidden already.
 * The wrist menu's "Hide all" and the voice commands use this, so there is always a way to clear the view.
 */
export function toggleAllPanels(): 'hidden' | 'shown' {
  const s = usePaletteUI.getState()
  const anyOpen = !s.closed || useGuide.getState().open
  if (anyOpen) {
    usePaletteUI.setState({ closed: true })
    useGuide.getState().closeGuide()
    return 'hidden'
  }
  summonPalette()
  return 'shown'
}
