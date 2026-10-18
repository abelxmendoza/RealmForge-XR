/**
 * Geometry analysis for imported 3D scans (Polycam, Scaniverse, RoomPlan, Matterport exports…).
 * Works on a flat triangle list in the scan's own units so it can be unit tested without three.js:
 * finds the floor height, the dominant wall direction (to square the scan up with the grid) and
 * the footprint, and turns those into the transform that drops the scan onto the world floor.
 */
import type { Vec3 } from '../world/types'

export interface ScanAnalysis {
  /** Height of the floor in scan units. */
  floorY: number
  /** Footprint centre (x, z) in scan units, measured with the walls squared up. */
  center: [number, number]
  /** Footprint width and depth in scan units with the walls squared up. */
  footprint: [number, number]
  /** Dominant wall direction in radians, folded into [−π/4, π/4). Rotating by −wallAngle squares the walls up. */
  wallAngle: number
  /** Bounding box size in scan units. */
  size: Vec3
  /** Triangles analysed (a sample of very large scans). */
  triangles: number
}

const FLOOR_BIN = 0.02

/**
 * `tri` holds 9 numbers per triangle (three xyz vertices). Pass `unit` (metres per scan unit, e.g.
 * 0.01 for centimetres) so the floor histogram uses 2 cm bins whatever the file's units are.
 */
export function analyzeTriangles(tri: Float32Array | number[], unit = 1): ScanAnalysis {
  const n = Math.floor(tri.length / 9)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < n * 9; i += 3) {
    const x = tri[i], y = tri[i + 1], z = tri[i + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  if (!n || !Number.isFinite(minX)) {
    return { floorY: 0, center: [0, 0], footprint: [0, 0], wallAngle: 0, size: [0, 0, 0], triangles: 0 }
  }

  const bin = FLOOR_BIN / unit
  const floorBins = new Map<number, { area: number; sumY: number }>()
  const wallBins = new Float64Array(90)
  for (let t = 0; t < n; t++) {
    const o = t * 9
    const ax = tri[o + 3] - tri[o], ay = tri[o + 4] - tri[o + 1], az = tri[o + 5] - tri[o + 2]
    const bx = tri[o + 6] - tri[o], by = tri[o + 7] - tri[o + 1], bz = tri[o + 8] - tri[o + 2]
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz)
    if (len === 0) continue
    const area = len / 2
    const up = Math.abs(ny) / len
    if (up > 0.9) {
      // Horizontal surface (floor, ceiling, table top). Winding varies between apps, so use |ny|.
      const y = (tri[o + 1] + tri[o + 4] + tri[o + 7]) / 3
      const k = Math.round(y / bin)
      const b = floorBins.get(k) ?? { area: 0, sumY: 0 }
      b.area += area
      b.sumY += y * area
      floorBins.set(k, b)
    } else if (up < 0.2) {
      // Vertical surface (wall): fold its facing into a quarter turn, 1° bins centred on whole degrees.
      const deg = (Math.atan2(nx, nz) * 180) / Math.PI
      wallBins[(((Math.round(deg) % 90) + 90) % 90)] += area
    }
  }

  const wallAngle = pickWallAngle(wallBins)
  const square = squaredExtent(tri, n, -wallAngle)
  return {
    floorY: pickFloor(floorBins) ?? minY,
    center: square.center,
    footprint: square.footprint,
    wallAngle,
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    triangles: n,
  }
}

/** Footprint of the scan turned by `rot` (three.js Y rotation), with its centre given back in file coordinates. */
function squaredExtent(tri: Float32Array | number[], n: number, rot: number) {
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (let i = 0; i < n * 9; i += 3) {
    const x = tri[i] * c + tri[i + 2] * s
    const z = -tri[i] * s + tri[i + 2] * c
    if (x < minX) minX = x
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (z > maxZ) maxZ = z
  }
  const mx = (minX + maxX) / 2
  const mz = (minZ + maxZ) / 2
  // Undo the turn: rotate the squared-up centre by −rot.
  return { center: [mx * c - mz * s, mx * s + mz * c] as [number, number], footprint: [maxX - minX, maxZ - minZ] as [number, number] }
}

/** The lowest horizontal level holding a real share of the horizontal area: the floor, not the ceiling or noise below it. */
function pickFloor(bins: Map<number, { area: number; sumY: number }>): number | null {
  if (!bins.size) return null
  const keys = [...bins.keys()].sort((a, b) => a - b)
  // Merge each bin with its neighbours so a slightly uneven floor counts as one level.
  const level = (k: number) => [k - 1, k, k + 1].reduce((s, j) => s + (bins.get(j)?.area ?? 0), 0)
  const peak = Math.max(...keys.map(level))
  const k = keys.find((j) => level(j) >= peak * 0.25)!
  let area = 0
  let sumY = 0
  for (const j of [k - 1, k, k + 1]) {
    const b = bins.get(j)
    if (b) {
      area += b.area
      sumY += b.sumY
    }
  }
  return sumY / area
}

/** Peak of the wall-facing histogram (smoothed, wrapping at 90°), refined between bins, folded to [−45°, 45°). */
function pickWallAngle(bins: Float64Array): number {
  const total = bins.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  const at = (i: number) => bins[(i + 90) % 90]
  const smooth = (i: number) => at(i - 1) + 2 * at(i) + at(i + 1)
  let best = 0
  for (let i = 1; i < 90; i++) if (smooth(i) > smooth(best)) best = i
  const l = smooth(best - 1), c = smooth(best), r = smooth(best + 1)
  const shift = l - 2 * c + r === 0 ? 0 : (0.5 * (l - r)) / (l - 2 * c + r)
  let deg = best + shift
  if (deg >= 45) deg -= 90
  return (deg * Math.PI) / 180
}

/**
 * Metres per scan unit, guessed from the footprint: phone LiDAR apps export metres, but some tools
 * write centimetres or millimetres. Anything wider than 400 units can't be a metre-scale site here.
 */
export function guessUnit(size: Vec3): number {
  const span = Math.max(size[0], size[2])
  if (span > 4000) return 0.001
  if (span > 400) return 0.01
  return 1
}

/** New scale after measuring: the two points were `measured` apart in the world but are really `real` metres apart. */
export function scaleFromMeasurement(currentScale: number, measured: number, real: number): number | null {
  if (!(measured > 1e-6) || !(real > 0) || !(currentScale > 0)) return null
  return (currentScale * real) / measured
}

/**
 * World position for the scan root so its floor sits at y = 0 and its footprint is centred on the
 * origin, plus the user's own nudge. The root applies scale, then rotationY, then this position.
 */
export function fitPosition(a: Pick<ScanAnalysis, 'floorY' | 'center'>, scale: number, rotationY: number, offset: Vec3): Vec3 {
  const cx = a.center[0] * scale
  const cz = a.center[1] * scale
  const c = Math.cos(rotationY)
  const s = Math.sin(rotationY)
  // three.js Y rotation: x' = x·cos + z·sin, z' = −x·sin + z·cos
  return [-(cx * c + cz * s) + offset[0], -a.floorY * scale + offset[1], -(-cx * s + cz * c) + offset[2]]
}
