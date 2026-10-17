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

export type ObjectKind = 'wall' | 'building'

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
