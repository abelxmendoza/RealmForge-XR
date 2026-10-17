import { create } from 'zustand'
import type { BuildingStyle, MaterialId, ObjectKind, RoofType, TreeStyle } from '../world/types'

export type DecorKind = Extract<ObjectKind, 'tree' | 'streetlight' | 'crate'>

/**
 * Editor-only preferences: snapping and what the creation tools place next.
 * Kept out of the world store so navigation never sees these changes.
 */
export interface EditorSettings {
  snap: boolean
  buildingStyle: BuildingStyle
  roof: RoofType
  wallMaterial: MaterialId
  platformMaterial: MaterialId
  decor: DecorKind
  treeStyle: TreeStyle
  set: (patch: Partial<Omit<EditorSettings, 'set'>>) => void
}

export const useEditor = create<EditorSettings>((set) => ({
  snap: true,
  buildingStyle: 'office',
  roof: 'flat',
  wallMaterial: 'concrete',
  platformMaterial: 'concrete',
  decor: 'tree',
  treeStyle: 'round',
  set: (patch) => set(patch),
}))
