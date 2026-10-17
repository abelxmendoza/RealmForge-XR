import { clampToWorld } from '../world/store'
import { snapAngle, snapFootprint, snapSize, snapValue } from '../world/snap'
import type { Vec2, Vec3, WorldObject } from '../world/types'

/** Smallest footprint edge an edit can produce. */
export const MIN_SIZE = 0.4
/** Smallest height, matching the `[` key. */
export const MIN_HEIGHT = 0.3
/** Height step when snapping, matching the `[` `]` keys. */
const HEIGHT_STEP = 0.5

/** A hand grab's transform in map-local units: where the object is, its yaw, and a uniform scale factor. */
export interface GrabTransform {
  x: number
  z: number
  rotationY: number
  scale: number
}

export type GrabPatch = Pick<WorldObject, 'position' | 'rotationY' | 'size'>

/**
 * Turn a grab transform into a store patch for `base` (the object as it was when the grab started).
 * Objects stay on the ground: only x/z, yaw and size change. Size only changes when the grab
 * actually scales (two hands), so a one-hand grab never resizes an object to the grid.
 */
export function grabPatch(base: WorldObject, t: GrabTransform, snap: boolean): GrabPatch {
  const rotationY = snap ? snapAngle(t.rotationY) : t.rotationY

  let size: Vec3 = base.size
  if (Math.abs(t.scale - 1) > 1e-3) {
    const [w, h, d] = base.size.map((v) => v * t.scale)
    size = snap
      ? [snapSize(w), Math.max(MIN_HEIGHT, snapValue(h, HEIGHT_STEP)), snapSize(d)]
      : [Math.max(MIN_SIZE, w), Math.max(MIN_HEIGHT, h), Math.max(MIN_SIZE, d)]
  }

  let at: Vec2 = [t.x, t.z]
  if (snap) at = snapFootprint(at, size[0], size[2], rotationY)
  return { position: [clampToWorld(at[0]), base.position[1], clampToWorld(at[1])], rotationY, size }
}

/** Whether two patches would put the object in the same place (skips redundant store updates and replans). */
export function samePatch(a: GrabPatch | undefined, b: GrabPatch): boolean {
  if (!a) return false
  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-6
  return (
    eq(a.rotationY, b.rotationY) &&
    a.position.every((v, i) => eq(v, b.position[i])) &&
    a.size.every((v, i) => eq(v, b.size[i]))
  )
}
