/**
 * Shared world schema. This is the contract between the XR editor and navigation.
 *
 * Units: 1 world unit = 1 m at "map scale". The whole map is rendered inside <WorldRoot>,
 * which shrinks it to a tabletop miniature, so these numbers never change between desktop and XR.
 * Axes: x right, z toward the viewer, y up. The ground is y = 0.
 * Origin: an object's `position` is the centre of its footprint at ground level (base centre).
 */
export type Vec3 = [x: number, y: number, z: number]
/** A point on the ground plane: [x, z]. */
export type Vec2 = [x: number, z: number]

export type ObjectKind = 'wall' | 'building' | 'platform' | 'tree' | 'streetlight' | 'crate'

/** Surface finish. Purely visual; navigation never reads it. */
export type MaterialId = 'concrete' | 'brick' | 'metal' | 'glass' | 'wood' | 'asphalt' | 'grass'
export type BuildingStyle = 'tower' | 'office' | 'house' | 'industrial'
export type TreeStyle = 'pine' | 'round'
export type RoofType = 'flat' | 'pitched'

export interface WorldObject {
  /** Stable id, never reused. */
  id: string
  kind: ObjectKind
  /** Base centre. y is normally 0. */
  position: Vec3
  /** Full extents [width (local x), height, depth (local z)]. */
  size: Vec3
  /** Yaw in radians around +y. Only yaw affects navigation. */
  rotationY: number
  color?: string

  // Optional, visual-only extras (added for worldbuilding; older objects without them still work).
  /** Walls and platforms: surface finish. */
  material?: MaterialId
  /** Buildings: BuildingStyle. Trees: TreeStyle. */
  style?: BuildingStyle | TreeStyle
  /** Buildings only. */
  roof?: RoofType
  /** Overrides the default of whether this object blocks navigation (see blocksNavigation). */
  solid?: boolean
}

/** Structures that block by default. Decorations (trees, streetlights, crates) do not, unless `solid` is set. */
const BLOCKING_KINDS: ReadonlySet<ObjectKind> = new Set(['wall', 'building'])
/** Platforms at or below this height are walkable surfaces (roads, plazas); taller ones block. */
export const STEP_HEIGHT = 0.3

/** Whether an object goes into the navigation occupancy grid. */
export function blocksNavigation(o: WorldObject): boolean {
  if (o.solid !== undefined) return o.solid
  if (o.kind === 'platform') return o.size[1] > STEP_HEIGHT
  return BLOCKING_KINDS.has(o.kind)
}

/** The subset of objects navigation should treat as obstacles. */
export function navObstacles(objects: Record<string, WorldObject> | Iterable<WorldObject>): WorldObject[] {
  const list = Symbol.iterator in objects ? [...(objects as Iterable<WorldObject>)] : Object.values(objects)
  return list.filter(blocksNavigation)
}

/** Map bounds and grid resolution. Map spans [-HALF, HALF] on x and z. */
export const WORLD = {
  half: 10,
  cell: 0.5,
  /** Robot clearance radius used to inflate obstacles. */
  robotRadius: 0.35,
  robotSpeed: 2.2,
} as const

export const GRID_SIZE = Math.round((WORLD.half * 2) / WORLD.cell)
