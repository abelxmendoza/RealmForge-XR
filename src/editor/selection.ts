import { create } from 'zustand'
import { useWorld } from '../world/store'

/**
 * Group selection made with the "frame hands" gesture (see docs/gestures.md). The world store keeps its
 * single `selectedId` for the editor and handles; this adds a set of objects that move, rotate, duplicate
 * and delete together. `preview` is what the frame would select while you are still holding it.
 */
export interface SelectionState {
  ids: string[]
  preview: string[]
  setGroup: (ids: string[]) => void
  setPreview: (ids: string[]) => void
  clear: () => void
}

export const useSelection = create<SelectionState>((set) => ({
  ids: [],
  preview: [],
  setGroup: (ids) => set({ ids: [...new Set(ids)], preview: [] }),
  setPreview: (preview) => set({ preview }),
  clear: () => set({ ids: [], preview: [] }),
}))

/** The group's ids that still exist (objects can be deleted or undone away underneath it). */
export function groupIds(): string[] {
  const objects = useWorld.getState().objects
  return useSelection.getState().ids.filter((id) => objects[id])
}

/** Ids to act on: the group if there is one, else the single selected object. */
export function actionTargets(): string[] {
  const group = groupIds()
  if (group.length) return group
  const id = useWorld.getState().selectedId
  return id ? [id] : []
}
