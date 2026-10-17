import { create } from 'zustand'

export type PlacementStatus = 'free' | 'choosing' | 'pinned'

export type QuatTuple = [number, number, number, number]
export type Vec3Tuple = [number, number, number]

// Identity until pinned: the scale presets (WorldScaler in Scene) place the world root themselves.
const DEFAULT_POSITION: Vec3Tuple = [0, 0, 0]
const DEFAULT_QUAT: QuatTuple = [0, 0, 0, 1]

export interface PlacementState {
  status: PlacementStatus
  position: Vec3Tuple
  quaternion: QuatTuple
  /** Live WebXR anchor while pinned (may be null if anchors unsupported). */
  anchor: XRAnchor | null
  /** Last plane label we pinned to (table / floor / …). */
  surfaceLabel: string | null

  startChoosing: () => void
  cancelChoosing: () => void
  pinAt: (position: Vec3Tuple, quaternion: QuatTuple, surfaceLabel: string, anchor: XRAnchor | null) => void
  setAnchor: (anchor: XRAnchor | null) => void
  resetToDefault: () => void
}

function dropAnchor(anchor: XRAnchor | null) {
  try {
    anchor?.delete?.()
  } catch {
    /* already gone with the session */
  }
}

export const usePlacement = create<PlacementState>((set, get) => ({
  status: 'free',
  position: DEFAULT_POSITION,
  quaternion: DEFAULT_QUAT,
  anchor: null,
  surfaceLabel: null,

  startChoosing: () => set({ status: 'choosing' }),

  cancelChoosing: () => {
    const { status, surfaceLabel } = get()
    if (status !== 'choosing') return
    set({ status: surfaceLabel ? 'pinned' : 'free' })
  },

  pinAt: (position, quaternion, surfaceLabel, anchor) => {
    dropAnchor(get().anchor)
    set({ status: 'pinned', position, quaternion, surfaceLabel, anchor })
  },

  setAnchor: (anchor) => set({ anchor }),

  resetToDefault: () => {
    dropAnchor(get().anchor)
    set({
      status: 'free',
      position: DEFAULT_POSITION,
      quaternion: DEFAULT_QUAT,
      anchor: null,
      surfaceLabel: null,
    })
  },
}))

/** Prefer table, then floor, then any other horizontal-ish plane. */
export function planePickPriority(semanticLabel: string | undefined): number {
  const label = (semanticLabel ?? '').toLowerCase()
  if (label === 'table') return 0
  if (label === 'floor') return 1
  if (label === 'couch' || label === 'seat') return 2
  return 3
}

export function isHorizontalPlaneNormal(ny: number, threshold = 0.8): boolean {
  return Math.abs(ny) >= threshold
}
