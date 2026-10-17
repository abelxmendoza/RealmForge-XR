import type { BuildingStyle, MaterialId, ObjectKind, PalletStyle, RackStyle, RoofType, TreeStyle, Vec3, WorldObject } from './types'
import { PALLET, RACK } from './scale'

/**
 * Defaults for every placeable thing. Pure data: the editor uses it to create objects,
 * the scene never needs it to draw them (missing fields fall back to these values).
 */
/** Real-world sizes in metres (see world/scale.ts): heights are whole storeys. */
export const BUILDING_STYLES: Record<BuildingStyle, { label: string; size: Vec3; color: string; roof: RoofType }> = {
  tower: { label: 'Glass tower', size: [12, 36, 12], color: '#b9cde0', roof: 'flat' }, // 12 storeys
  office: { label: 'Office block', size: [16, 12, 12], color: '#d8d2c4', roof: 'flat' }, // 4 storeys
  house: { label: 'House', size: [9, 6, 8], color: '#e6d3b3', roof: 'pitched' }, // 2 storeys + roof
  industrial: { label: 'Industrial', size: [20, 9, 15], color: '#a3adb5', roof: 'flat' }, // 2 tall bays
}
export const BUILDING_STYLE_IDS = Object.keys(BUILDING_STYLES) as BuildingStyle[]

export const MATERIAL_LABELS: Record<MaterialId, string> = {
  concrete: 'Concrete',
  brick: 'Brick',
  metal: 'Metal',
  glass: 'Glass',
  wood: 'Wood',
  asphalt: 'Asphalt road',
  grass: 'Grass',
}
export const WALL_MATERIALS: MaterialId[] = ['concrete', 'brick', 'metal', 'glass', 'wood']
export const PLATFORM_MATERIALS: MaterialId[] = ['concrete', 'asphalt', 'grass', 'metal', 'wood']
export const CRATE_MATERIALS: MaterialId[] = ['wood', 'metal']
export const TREE_STYLES: TreeStyle[] = ['round', 'pine']

export const PLATFORM_DEFAULTS = { size: [8, 0.15, 8] as Vec3 }
export const DECOR_DEFAULTS: Record<'tree' | 'streetlight' | 'crate', { size: Vec3 }> = {
  tree: { size: [4, 8, 4] },
  streetlight: { size: [0.4, 6, 0.4] },
  crate: { size: [1.2, 1.2, 1.2] },
}

/** Warehouse equipment placed with the equipment tool (key 8). Real sizes from world/scale.ts. */
export type EquipmentKind = Extract<ObjectKind, 'pallet' | 'rack'>
export const PALLET_STYLES: PalletStyle[] = ['empty', 'boxes', 'wrapped']
export const RACK_STYLES: RackStyle[] = ['empty', 'loaded']
export const EQUIPMENT_DEFAULTS: Record<EquipmentKind, { size: Vec3; style: PalletStyle | RackStyle }> = {
  pallet: { size: [PALLET.width, PALLET.heightFor.boxes, PALLET.depth], style: 'boxes' },
  rack: { size: [RACK.bay, 4.5, RACK.depth], style: 'loaded' },
}
/** Size for an equipment object of `kind` and `style` (pallet height follows its load). */
export function equipmentSize(kind: EquipmentKind, style: PalletStyle | RackStyle): Vec3 {
  if (kind === 'pallet') return [PALLET.width, PALLET.heightFor[style as PalletStyle] ?? PALLET.height, PALLET.depth]
  return [...EQUIPMENT_DEFAULTS.rack.size]
}

export const KIND_LABELS: Record<ObjectKind, string> = {
  wall: 'Wall',
  building: 'Building',
  platform: 'Platform',
  tree: 'Tree',
  streetlight: 'Streetlight',
  crate: 'Crate',
  pallet: 'Pallet',
  rack: 'Pallet rack',
}

export const defaultMaterial = (o: Pick<WorldObject, 'kind' | 'material'>): MaterialId =>
  o.material ?? (o.kind === 'crate' ? 'wood' : 'concrete')
export const buildingStyle = (o: WorldObject): BuildingStyle =>
  o.style && o.style in BUILDING_STYLES ? (o.style as BuildingStyle) : 'office'
export const buildingRoof = (o: WorldObject): RoofType => o.roof ?? BUILDING_STYLES[buildingStyle(o)].roof
export const treeStyle = (o: WorldObject): TreeStyle => (o.style === 'pine' ? 'pine' : 'round')
export const palletStyle = (o: WorldObject): PalletStyle =>
  o.style && (PALLET_STYLES as string[]).includes(o.style) ? (o.style as PalletStyle) : 'empty'
export const rackStyle = (o: WorldObject): RackStyle => (o.style === 'loaded' ? 'loaded' : 'empty')

const next = <T>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]

/**
 * The "next look" for an object (key M, or the purple handle): cycles its material or style.
 * Returns a patch for updateObject, or null when the kind has no variants.
 */
export function cycleVariant(o: WorldObject): Partial<WorldObject> | null {
  switch (o.kind) {
    case 'wall':
      return { material: next(WALL_MATERIALS, defaultMaterial(o)) }
    case 'platform':
      return { material: next(PLATFORM_MATERIALS, defaultMaterial(o)) }
    case 'crate':
      return { material: next(CRATE_MATERIALS, defaultMaterial(o)) }
    case 'tree':
      return { style: next(TREE_STYLES, treeStyle(o)) }
    case 'pallet': {
      // The load changes the height; the footprint stays a real pallet.
      const style = next(PALLET_STYLES, palletStyle(o))
      return { style, size: [o.size[0], PALLET.heightFor[style], o.size[2]] }
    }
    case 'rack':
      return { style: next(RACK_STYLES, rackStyle(o)) }
    case 'building': {
      const style = next(BUILDING_STYLE_IDS, buildingStyle(o))
      return { style, roof: BUILDING_STYLES[style].roof, color: BUILDING_STYLES[style].color }
    }
    default:
      return null
  }
}
