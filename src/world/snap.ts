import { WORLD, type Vec2 } from './types'

/** Snapping step for positions and sizes: one navigation cell. */
export const SNAP: number = WORLD.cell
/** Rotation snapping step: 15°. */
export const SNAP_ANGLE = Math.PI / 12

export const snapValue = (v: number, step = SNAP) => Math.round(v / step) * step
export const snapPoint = ([x, z]: Vec2, step = SNAP): Vec2 => [snapValue(x, step), snapValue(z, step)]
export const snapAngle = (a: number, step = SNAP_ANGLE) => snapValue(a, step)
/** Snap a size to the grid, never below one step. */
export const snapSize = (v: number, step = SNAP) => Math.max(step, snapValue(v, step))

/**
 * Snap an object's base centre so its footprint edges land on grid lines.
 * Only possible when it is axis-aligned (yaw a multiple of 90°); otherwise the centre is snapped.
 */
export function snapFootprint(center: Vec2, width: number, depth: number, rotationY: number, step = SNAP): Vec2 {
  const quarter = rotationY / (Math.PI / 2)
  const k = Math.round(quarter)
  if (Math.abs(quarter - k) > 1e-3) return snapPoint(center, step)
  const swapped = Math.abs(k) % 2 === 1
  const ex = swapped ? depth : width
  const ez = swapped ? width : depth
  const edge = (c: number, e: number) => snapValue(c - e / 2, step) + e / 2
  return [edge(center[0], ex), edge(center[1], ez)]
}
