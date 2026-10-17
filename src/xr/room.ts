import { create } from 'zustand'

/**
 * Your real room as simple 2D shapes in tracking space (metres, y up), from Space Setup:
 * plane-detection (walls, floor, tables) and mesh-detection (furniture boxes). Shared by occlusion and
 * "respect real surfaces". The helpers below are pure and unit-tested; RoomTracker (roomTracker.tsx) fills
 * the store from the XR frame.
 */
export type XZ = [number, number]

/** A horizontal surface something can rest on: a table, desk, couch seat, floor, or a furniture box top. */
export interface RoomSurface {
  label: string
  y: number
  /** Outline in xz. */
  polygon: XZ[]
}

/** Something you can't push an object through: a wall (segment) or a piece of furniture (box with a top). */
export type RoomObstacle =
  | { kind: 'segment'; label: string; a: XZ; b: XZ }
  | { kind: 'box'; label: string; min: XZ; max: XZ; top: number }

export interface RoomState {
  surfaces: RoomSurface[]
  obstacles: RoomObstacle[]
  planes: number
  meshes: number
}

export const useRoom = create<RoomState>(() => ({ surfaces: [], obstacles: [], planes: 0, meshes: 0 }))

/** Labels that are never something to rest on or bump into here. */
const IGNORE = new Set(['ceiling', 'global mesh'])
export const usableLabel = (label: string | undefined) => !IGNORE.has((label ?? '').toLowerCase())

export function pointInPolygon([x, z]: XZ, poly: readonly XZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Highest real surface under `p` that is at or below `fromY` (so you can't land on a shelf above your head); else `floorY`. */
export function restHeight(p: XZ, fromY: number, surfaces: readonly RoomSurface[], floorY: number): number {
  let best = floorY
  for (const s of surfaces) {
    if (s.y > fromY + 1e-3 || s.y <= best) continue
    if (pointInPolygon(p, s.polygon)) best = s.y
  }
  return best
}

function segmentDistance([px, pz]: XZ, [ax, az]: XZ, [bx, bz]: XZ): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
}

/** Whether a footprint of radius `r` at `p`, standing at height `baseY`, overlaps an obstacle. Objects on top of furniture pass over it. */
export function collides(p: XZ, r: number, baseY: number, obstacles: readonly RoomObstacle[]): boolean {
  for (const o of obstacles) {
    if (o.kind === 'segment') {
      if (segmentDistance(p, o.a, o.b) < r) return true
    } else if (baseY < o.top - 0.02) {
      if (p[0] > o.min[0] - r && p[0] < o.max[0] + r && p[1] > o.min[1] - r && p[1] < o.max[1] + r) return true
    }
  }
  return false
}

/**
 * Move a footprint from `from` towards `to`, stopping just before it would enter a wall or furniture.
 * If it already overlaps something at `from` (placed before the room was known), it moves freely so it never gets stuck.
 */
export function blockMove(from: XZ, to: XZ, r: number, baseY: number, obstacles: readonly RoomObstacle[]): XZ {
  if (!obstacles.length || collides(from, r, baseY, obstacles)) return to
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.max(0.01, r / 4)))
  let last: XZ = from
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const p: XZ = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
    if (collides(p, r, baseY, obstacles)) return last
    last = p
  }
  return to
}
