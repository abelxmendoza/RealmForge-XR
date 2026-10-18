import { create } from 'zustand'
import type { ToolbarSection } from './toolbar'

/**
 * Shared desktop chrome section (left HUD tabs).
 * The right inspector reads this so Save / Simulate can surface Worlds + Simulation
 * without duplicating those panels on every tool view.
 */
export const useHudSection = create<{
  section: ToolbarSection
  setSection: (section: ToolbarSection) => void
}>((set) => ({
  section: 'build',
  setSection: (section) => set({ section }),
}))
