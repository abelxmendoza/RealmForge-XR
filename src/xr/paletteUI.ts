import { create } from 'zustand'

/**
 * Shared state for main's in-VR Control Palette, so the wrist menu can show / hide it and open a page
 * (the wrist holds quick toggles; the palette holds the asset library, routes and saves).
 */
export interface PaletteUI {
  hidden: boolean
  /** A page the palette should switch to (bumped `request` each time so the same page can be re-requested). */
  page: string | null
  request: number
  /** Bumped to re-place the palette in front of you. */
  recenter: number
}

export const usePaletteUI = create<PaletteUI>(() => ({ hidden: false, page: null, request: 0, recenter: 0 }))

export const setPaletteHidden = (hidden: boolean) => usePaletteUI.setState({ hidden })

/** Show or hide the palette; showing it brings it back in front of you. */
export function togglePalette() {
  const s = usePaletteUI.getState()
  usePaletteUI.setState(s.hidden ? { hidden: false, recenter: s.recenter + 1 } : { hidden: true })
}

/** Show the palette in front of you on `page` (for example 'Assets'). */
export function openPalettePage(page: string) {
  const s = usePaletteUI.getState()
  usePaletteUI.setState({ hidden: false, page, request: s.request + 1, recenter: s.recenter + 1 })
}
