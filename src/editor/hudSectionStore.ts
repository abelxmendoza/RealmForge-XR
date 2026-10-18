import { create } from 'zustand'
import type { HudSectionId } from './hudTools'

/**
 * Shared desktop chrome section (left HUD tabs).
 * The right inspector reads this so Save / Simulate can surface Worlds + Simulation
 * without duplicating those panels on every tool view.
 */
export const useHudSection = create<{
  section: HudSectionId
  setSection: (section: HudSectionId) => void
}>((set) => ({
  section: 'build',
  setSection: (section) => set({ section }),
}))
