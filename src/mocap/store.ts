import { create } from 'zustand'
import type { MocapFrame } from './rokoko'

export type MocapStatus = 'off' | 'connecting' | 'live' | 'error'

/**
 * Smartsuit connection state for the UI. Kept separate from the world store so navigation and
 * editing never re-run on mocap traffic. Frames themselves go in `mocapFrame` (not React state):
 * they arrive at 60 fps and are read from the render loop.
 */
export interface MocapState {
  enabled: boolean
  status: MocapStatus
  fps: number
  actors: number
  error?: string
  /** room: draw at 1:1 in your real room. map: draw inside the world, scaled with it. */
  placement: 'room' | 'map'
  set: (patch: Partial<Omit<MocapState, 'set'>>) => void
}

export const useMocap = create<MocapState>((set) => ({
  enabled: false,
  status: 'off',
  fps: 0,
  actors: 0,
  placement: 'room',
  set: (patch) => set(patch),
}))

/** Latest frame and when it arrived (performance.now()). */
export const mocapFrame: { current: MocapFrame | null; receivedAt: number } = { current: null, receivedAt: 0 }

export const toggleMocap = () => useMocap.getState().set({ enabled: !useMocap.getState().enabled })
