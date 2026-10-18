import type { ActorKind } from '../actors/types'
import type { AssetId } from '../world/assetTypes'
import { create } from 'zustand'
import type { BuildingStyle, MaterialId, ObjectKind, RoofType, TreeStyle } from '../world/types'
import type { ScaleId } from '../scene/worldRoot'

export type DecorKind = Extract<ObjectKind, 'tree' | 'streetlight' | 'crate'>

/**
 * Editor-only preferences: snapping and what the creation tools place next.
 * Kept out of the world store so navigation never sees these changes.
 */
export interface EditorSettings {
  actorKind: ActorKind
  actorMessage: string
  /** When true, goal clicks append a stop to the selected actor’s route instead of replacing it. */
  actorAppendRoute: boolean
  assetId: AssetId
  assetRotation: number
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
  /**
   * Hide virtual objects behind real ones (Quest 3/3S live depth, else the Space Setup room). Off by
   * default; see xr/occlusion.tsx and docs/occlusion.md.
   */
  occlusion: boolean
  /** Virtual objects rest on real tables and stop at real walls / furniture (Space Setup; xr/realSurfaces.ts). */
  realSurfaces: boolean
  /** Hand gestures in XR (L axis, frame select, pinch-roll rotate, two-fist pull; see docs/gestures.md). */
  gestures: boolean
  buildingStyle: BuildingStyle
  roof: RoofType
  wallMaterial: MaterialId
  platformMaterial: MaterialId
  decor: DecorKind
  treeStyle: TreeStyle
  /** Active event catalog entry for the Event placement tool. */
  eventCatalogId: string
  set: (patch: Partial<Omit<EditorSettings, 'set'>>) => void
}

export const useEditor = create<EditorSettings>((set) => ({
  actorKind: 'worker',
  actorMessage: '',
  actorAppendRoute: false,
  assetId: 'storage-rack',
  assetRotation: 0,
  snap: true,
  worldScale: 'tabletop',
  rays: false,
  surface: 'real',
  occlusion: false,
  realSurfaces: false,
  gestures: true,
  buildingStyle: 'office',
  roof: 'flat',
  wallMaterial: 'concrete',
  platformMaterial: 'concrete',
  decor: 'tree',
  treeStyle: 'round',
  eventCatalogId: 'exhibition-booth',
  set: (patch) => set(patch),
}))
