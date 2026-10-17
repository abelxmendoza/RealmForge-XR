import { create } from 'zustand'
import type { BuildingStyle, MaterialId, ObjectKind, RoofType, TreeStyle } from '../world/types'
import type { ScaleId } from '../scene/worldRoot'

export type DecorKind = Extract<ObjectKind, 'tree' | 'streetlight' | 'crate'>

/**
 * Editor-only preferences: snapping and what the creation tools place next.
 * Kept out of the world store so navigation never sees these changes.
 */
export interface EditorSettings {
  snap: boolean
  /** How big the world is shown relative to your room (see SCALE_PRESETS). */
  worldScale: ScaleId
  /** XR pointer rays on hands and controllers. Off: you grab and poke things directly. */
  rays: boolean
  /**
   * What the world stands on. real: a transparent grid, so your actual floor or table is the surface
   * (passthrough shows through). virtual: a solid textured placeholder ground drawn over the room.
   */
  surface: 'real' | 'virtual'
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
  worldScale: 'tabletop',
  rays: false,
  surface: 'real',
  buildingStyle: 'office',
  roof: 'flat',
  wallMaterial: 'concrete',
  platformMaterial: 'concrete',
  decor: 'tree',
  treeStyle: 'round',
  set: (patch) => set(patch),
}))
