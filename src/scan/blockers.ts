import type { Vec3 } from '../world/types'

/** Surfaces between these heights (metres over the floor) block movement: walls, columns, furniture — not the floor, ceiling or cables. */
export const BLOCK_BAND: [number, number] = [0.15, 1.8]
/** Sample spacing on the scan's surfaces (metres). */
const RES = 0.1
/** Safety cap on pieces examined per call, so a pathological mesh can't freeze the page. */
const MAX_PIECES = 20_000_000

export interface ScanPlacement {
  scale: number
  rotationY: number
  position: Vec3
}

/**
 * Where an imported scan blocks movement, as x,z pairs in world metres (one per 10 cm square).
 * `tri` is the scan in its own units (9 numbers per triangle); `place` is how the scan root is
 * transformed into the world (scale, then Y rotation, then position — as rendered).
 */
export function scanBlockerPoints(tri: Float32Array | number[], place: ScanPlacement, band = BLOCK_BAND, res = RES): Float32Array {
  const c = Math.cos(place.rotationY)
  const s = Math.sin(place.rotationY)
  const [px, py, pz] = place.position
  const k = place.scale
  const seen = new Set<number>()
  const out: number[] = []
  const add = (x: number, y: number, z: number) => {
    if (y < band[0] || y > band[1]) return
    const ix = Math.round(x / res)
    const iz = Math.round(z / res)
    const key = (ix + 50000) * 100000 + (iz + 50000)
    if (seen.has(key)) return
    seen.add(key)
    out.push(ix * res, iz * res)
  }
  const v = new Float64Array(9)
  const stack: Float64Array[] = []
  let pieces = 0
  const n = Math.floor(tri.length / 9)
  for (let t = 0; t < n; t++) {
    for (let q = 0; q < 3; q++) {
      const o = t * 9 + q * 3
      const x = tri[o] * k
      const y = tri[o + 1] * k
      const z = tri[o + 2] * k
      // three.js Y rotation: x' = x·cos + z·sin, z' = −x·sin + z·cos
      v[q * 3] = x * c + z * s + px
      v[q * 3 + 1] = y + py
      v[q * 3 + 2] = -x * s + z * c + pz
    }
    // Halve along the longest edge until every piece is under `res`, dropping pieces outside the band.
    // Cost follows the in-band area, and spacing never exceeds `res` however large the triangle.
    stack.length = 0
    stack.push(Float64Array.from(v))
    while (stack.length && pieces < MAX_PIECES) {
      const p = stack.pop()!
      pieces++
      if (Math.max(p[1], p[4], p[7]) < band[0] || Math.min(p[1], p[4], p[7]) > band[1]) continue
      const e01 = Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2])
      const e12 = Math.hypot(p[6] - p[3], p[7] - p[4], p[8] - p[5])
      const e20 = Math.hypot(p[0] - p[6], p[1] - p[7], p[2] - p[8])
      const longest = Math.max(e01, e12, e20)
      if (longest <= res) {
        add(p[0], p[1], p[2])
        add(p[3], p[4], p[5])
        add(p[6], p[7], p[8])
        add((p[0] + p[3] + p[6]) / 3, (p[1] + p[4] + p[7]) / 3, (p[2] + p[5] + p[8]) / 3)
        continue
      }
      // Rotate so the longest edge is a→b, then split at its midpoint m: (a, m, c) and (m, b, c).
      const [a, b, c] = longest === e01 ? [0, 3, 6] : longest === e12 ? [3, 6, 0] : [6, 0, 3]
      const m = [(p[a] + p[b]) / 2, (p[a + 1] + p[b + 1]) / 2, (p[a + 2] + p[b + 2]) / 2]
      stack.push(
        Float64Array.of(p[a], p[a + 1], p[a + 2], m[0], m[1], m[2], p[c], p[c + 1], p[c + 2]),
        Float64Array.of(m[0], m[1], m[2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]),
      )
    }
  }
  return new Float32Array(out)
}
