import { create } from 'zustand'
import type { GuideSectionId } from './controlsGuide'

interface GuideState {
  open: boolean
  section: GuideSectionId
  /** Open the shared guide (desktop modal and/or XR panel). */
  openGuide: (section?: GuideSectionId) => void
  closeGuide: () => void
  toggleGuide: () => void
  setSection: (section: GuideSectionId) => void
}

export const useGuide = create<GuideState>((set, get) => ({
  open: false,
  section: 'start',
  openGuide: (section) => set({ open: true, ...(section ? { section } : {}) }),
  closeGuide: () => set({ open: false }),
  toggleGuide: () => set({ open: !get().open }),
  setSection: (section) => set({ section, open: true }),
}))
