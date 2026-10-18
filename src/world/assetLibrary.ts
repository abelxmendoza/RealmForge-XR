import { create } from 'zustand'
import type { DestinationRole } from './assetTypes'
import type { MaterialId, ObjectKind, RoofType, Vec3, WorldObject } from './types'
import { BUILDING_STYLES, BUILDING_STYLE_IDS, DECOR_DEFAULTS } from './catalog'
import { PALLET, RACK } from './scale'

/**
 * The asset library: one registry of everything a user can place (see docs/asset-library.md).
 *
 * - Built-in, procedural assets: main's warehouse catalog (ASSETS: equipment + robot destinations), real-size
 *   pallets and pallet racks, building styles and decorations.
 * - Custom assets: 3D models (.glb) listed in `public/assets/library.json`, registered at editor start
 *   (assetManifest.ts) and drawn by ModelStructure, fitted to the asset's real size.
 *
 * Placement, previews and overlap checks (assets.ts) work the same for every entry.
 */
export type AssetCategory = 'Warehouse' | 'Equipment' | 'Destinations' | 'Structures' | 'Decor' | 'Custom'
export const ASSET_CATEGORIES: AssetCategory[] = ['Warehouse', 'Equipment', 'Destinations', 'Structures', 'Decor', 'Custom']

export interface CatalogAsset {
  id: string
  name: string
  category: AssetCategory
  /** World object kind it becomes (custom models use a solid kind so navigation sees their footprint). */
  kind: ObjectKind
  /** Real size in metres [width, height, depth]. */
  size: Vec3
  color: string
  solid: boolean
  destinationRole?: DestinationRole
  description: string
  style?: WorldObject['style']
  material?: MaterialId
  roof?: RoofType
  /** Custom 3D model; omitted for built-in procedural assets. */
  render?: { model: string; fit: 'contain' | 'stretch' }
  source: 'builtin' | 'custom'
}

/** main's warehouse catalog (equipment + robot destinations), drawn by CatalogStructure. */
export const ASSETS: readonly CatalogAsset[] = [
  { id: 'storage-rack', name: 'Storage rack', category: 'Equipment', kind: 'building', size: [4, 3, 1.5], color: '#ed964b', solid: true, description: 'Three shelf levels; the full footprint blocks navigation.', source: 'builtin' },
  { id: 'workstation', name: 'Workstation', category: 'Equipment', kind: 'building', size: [2.4, 1.5, 1.2], color: '#65a9b6', solid: true, description: 'Work bench with an inspection screen.', source: 'builtin' },
  { id: 'conveyor', name: 'Conveyor', category: 'Equipment', kind: 'platform', size: [4, 0.85, 1.2], color: '#7b8ea3', solid: true, description: 'Static conveyor section; blocks the robot.', source: 'builtin' },
  { id: 'cargo', name: 'Cargo container', category: 'Equipment', kind: 'crate', size: [1.2, 1.2, 1.2], color: '#cda36d', solid: true, description: 'Solid cargo, movable using the existing editor.', source: 'builtin' },
  { id: 'barrier', name: 'Safety barrier', category: 'Equipment', kind: 'wall', size: [3, 1.1, 0.4], color: '#ffc857', solid: true, description: 'Move into an aisle to test replanning.', source: 'builtin' },
  { id: 'loading-bay', name: 'Loading bay', category: 'Equipment', kind: 'platform', size: [5, 0.06, 4], color: '#f5b85b', solid: false, destinationRole: 'delivery', description: 'Walkable delivery bay. Send the robot to its center.', source: 'builtin' },
  { id: 'pickup-zone', name: 'Pickup zone', category: 'Destinations', kind: 'platform', size: [2.5, 0.04, 2.5], color: '#45c4c7', solid: false, destinationRole: 'pickup', description: 'Navigable pickup location; cargo handling is not automated yet.', source: 'builtin' },
  { id: 'delivery-zone', name: 'Delivery zone', category: 'Destinations', kind: 'platform', size: [2.5, 0.04, 2.5], color: '#f2b35d', solid: false, destinationRole: 'delivery', description: 'Navigable delivery destination.', source: 'builtin' },
  { id: 'charging-pad', name: 'Charging pad', category: 'Destinations', kind: 'platform', size: [2, 0.08, 2], color: '#72d995', solid: false, destinationRole: 'charging', description: 'Robot parking destination; battery simulation is a future feature.', source: 'builtin' },
  { id: 'inspection-point', name: 'Inspection point', category: 'Destinations', kind: 'platform', size: [2, 0.04, 2], color: '#bb9ded', solid: false, destinationRole: 'inspection', description: 'Navigable inspection checkpoint.', source: 'builtin' },
]

const pallet = (style: 'empty' | 'boxes' | 'wrapped', name: string): CatalogAsset => ({
  id: `pallet-${style}`, name, category: 'Warehouse', kind: 'pallet', style, color: '#c9a26a', solid: true, source: 'builtin',
  size: [PALLET.width, PALLET.heightFor[style], PALLET.depth], description: 'EUR pallet, 1.2 × 1.0 m. Blocks the robot.',
})
const rack = (bays: number, style: 'loaded' | 'empty'): CatalogAsset => ({
  id: `rack-${bays}-${style}`, name: `Rack ×${bays}${style === 'empty' ? ' (empty)' : ''}`, category: 'Warehouse', kind: 'rack', style, color: '#2f5fa8', solid: true, source: 'builtin',
  size: [bays * RACK.bay, 6, RACK.depth], description: `Selective racking, ${bays} bay${bays > 1 ? 's' : ''} of 2.7 m, 6 m tall (4 levels).`,
})

/** Built-in procedural assets beyond main's catalog. */
const BUILTIN_EXTRA: CatalogAsset[] = [
  pallet('empty', 'Pallet (empty)'),
  pallet('boxes', 'Pallet (boxes)'),
  pallet('wrapped', 'Pallet (wrapped)'),
  rack(1, 'loaded'),
  rack(3, 'loaded'),
  rack(3, 'empty'),
  ...BUILDING_STYLE_IDS.map((style): CatalogAsset => ({
    id: `building-${style}`, name: BUILDING_STYLES[style].label, category: 'Structures', kind: 'building', style,
    roof: BUILDING_STYLES[style].roof, color: BUILDING_STYLES[style].color, size: [...BUILDING_STYLES[style].size], solid: true, source: 'builtin',
    description: 'Real-size building; storeys are 3 m.',
  })),
  { id: 'tree-round', name: 'Tree (round)', category: 'Decor', kind: 'tree', style: 'round', color: '#5f9e4a', size: [...DECOR_DEFAULTS.tree.size], solid: false, source: 'builtin', description: 'Does not block the robot.' },
  { id: 'tree-pine', name: 'Tree (pine)', category: 'Decor', kind: 'tree', style: 'pine', color: '#3f7a4f', size: [...DECOR_DEFAULTS.tree.size], solid: false, source: 'builtin', description: 'Does not block the robot.' },
  { id: 'streetlight', name: 'Streetlight', category: 'Decor', kind: 'streetlight', color: '#3a424a', size: [...DECOR_DEFAULTS.streetlight.size], solid: false, source: 'builtin', description: '6 m street lamp.' },
  { id: 'crate-wood', name: 'Crate (wood)', category: 'Decor', kind: 'crate', material: 'wood', color: '#c9a26a', size: [...DECOR_DEFAULTS.crate.size], solid: true, source: 'builtin', description: 'Solid crate.' },
]

const registry = new Map<string, CatalogAsset>([...ASSETS, ...BUILTIN_EXTRA].map((a) => [a.id, a]))

/** Bumped when assets are registered, so pickers re-render. */
export const useAssetLibrary = create<{ version: number }>(() => ({ version: 0 }))

export const getAsset = (id: string): CatalogAsset | undefined => registry.get(id)
export const libraryAssets = (): CatalogAsset[] => [...registry.values()]
export const assetsIn = (category: AssetCategory): CatalogAsset[] => libraryAssets().filter((a) => a.category === category)
/** main's warehouse catalog ids, drawn by CatalogStructure. */
export const isWarehouseCatalogAsset = (id: string) => ASSETS.some((a) => a.id === id)

/** Add custom assets (from the manifest). Built-in ids can't be replaced. Returns the ids added. */
export function registerAssets(assets: CatalogAsset[]): string[] {
  const added: string[] = []
  for (const a of assets) {
    if (registry.get(a.id)?.source === 'builtin') continue
    registry.set(a.id, a)
    added.push(a.id)
  }
  if (added.length) useAssetLibrary.setState((s) => ({ version: s.version + 1 }))
  return added
}
