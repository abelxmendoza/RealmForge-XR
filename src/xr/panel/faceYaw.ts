/**
 * Yaw that turns a panel at `panel` so its front (+z) faces `head` (both [x, z] in the same space).
 * Pure, so it is unit-tested.
 */
export function faceYaw(panel: readonly [number, number], head: readonly [number, number]): number {
  return Math.atan2(head[0] - panel[0], head[1] - panel[1])
}
