import { cross, dot, mid, norm, sub, type V3 } from './handPose'
import type { Vec2 } from '../../world/types'

/**
 * The maths behind each gesture, kept pure so it is unit-tested. Yaw follows three.js: rotating by θ
 * about +Y maps +X to (cos θ, 0, −sin θ).
 */

const TAU = Math.PI * 2
/** Wrap an angle to [−π, π). */
export const wrapAngle = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU)

/** Yaw that turns the world's +X axis to point along `dir` (flattened onto the floor). */
export function yawAligning(dir: V3): number {
  return Math.atan2(-dir[2], dir[0])
}

/** Of `target + k·step`, the one closest to `current` (so aligning a grid never spins it more than needed). */
export function nearestEquivalent(target: number, current: number, step = Math.PI / 2): number {
  return target + step * Math.round((current - target) / step)
}

/** Rotate a floor point `p` about `pivot` by `yaw`. */
export function rotateAbout(p: Vec2, pivot: Vec2, yaw: number): Vec2 {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const dx = p[0] - pivot[0]
  const dz = p[1] - pivot[1]
  // Same convention as three.js rotation.y: (x, z) → (x cos + z sin, −x sin + z cos).
  return [pivot[0] + c * dx + s * dz, pivot[1] - s * dx + c * dz]
}

/** Floor angle of the vector from hand `a` to hand `b` (same convention as yaw). */
const floorAngle = (a: V3, b: V3) => Math.atan2(-(b[2] - a[2]), b[0] - a[0])

/**
 * Two-fist world pull, one frame: how the world moves when the hands move from (l0, r0) to (l1, r1).
 * The world turns by the change in the hands' floor angle about their old midpoint, then follows the
 * midpoint. Floor-only (x, z): pulling never lifts or sinks the world, and it is 1:1 so scale stays true.
 */
export function pullStep(l0: V3, r0: V3, l1: V3, r1: V3): { pivot: Vec2; yaw: number; move: Vec2 } {
  const m0 = mid(l0, r0)
  const m1 = mid(l1, r1)
  return {
    pivot: [m0[0], m0[2]],
    yaw: wrapAngle(floorAngle(l1, r1) - floorAngle(l0, r0)),
    move: [m1[0] - m0[0], m1[2] - m0[2]],
  }
}

/** Apply a pull step to a world-root pose (floor position + yaw). */
export function applyPull(pos: Vec2, yaw: number, step: ReturnType<typeof pullStep>): { pos: Vec2; yaw: number } {
  const r = rotateAbout(pos, step.pivot, step.yaw)
  return { pos: [r[0] + step.move[0], r[1] + step.move[1]], yaw: yaw + step.yaw }
}

/**
 * Whether `point` is inside the rectangle your two hands frame, as seen from `head`: the view-space
 * rectangle spanned by the corners `a` and `b`, and in front of you. This is the "frame hands" selection.
 */
export function insideViewFrame(point: V3, head: V3, a: V3, b: V3): boolean {
  const center = mid(a, b)
  const forward = norm(sub(center, head))
  let right = norm(cross(forward, [0, 1, 0]))
  if (Math.abs(dot(forward, [0, 1, 0])) > 0.99) right = [1, 0, 0]
  const up = cross(right, forward)
  // Project onto the image plane at distance 1 (tangent-space coordinates).
  const proj = (p: V3): [number, number] | null => {
    const v = sub(p, head)
    const z = dot(v, forward)
    return z > 0.05 ? [dot(v, right) / z, dot(v, up) / z] : null
  }
  const pa = proj(a)
  const pb = proj(b)
  const pp = proj(point)
  if (!pa || !pb || !pp) return false
  return pp[0] >= Math.min(pa[0], pb[0]) && pp[0] <= Math.max(pa[0], pb[0]) && pp[1] >= Math.min(pa[1], pb[1]) && pp[1] <= Math.max(pa[1], pb[1])
}

/** Group rotation about its centroid: new positions and yaws for objects rotated by `yaw` (map space). */
export function rotateGroup<T extends { position: [number, number, number]; rotationY: number }>(objects: T[], yaw: number): { position: [number, number, number]; rotationY: number }[] {
  const n = objects.length || 1
  const c: Vec2 = [objects.reduce((s, o) => s + o.position[0], 0) / n, objects.reduce((s, o) => s + o.position[2], 0) / n]
  return objects.map((o) => {
    const [x, z] = rotateAbout([o.position[0], o.position[2]], c, yaw)
    return { position: [x, o.position[1], z], rotationY: o.rotationY + yaw }
  })
}
