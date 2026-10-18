import type { Vec3 } from '../world/types'

/** Surfaces between these heights (metres over the floor) block movement: walls, columns, furniture — not the floor, ceiling or cables. */
export const BLOCK_BAND: [number, number] = [0.15, 1.8]
/** Sample spacing on the scan's surfaces (metres). */
const RES = 0.1
/** Cap on samples per triangle edge, so one giant triangle can't stall the page. */
const MAX_STEPS = 200

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
    const minY = Math.min(v[1], v[4], v[7])
    const maxY = Math.max(v[1], v[4], v[7])
    if (maxY < band[0] || minY > band[1]) continue
    const edge = Math.max(
      Math.hypot(v[3] - v[0], v[4] - v[1], v[5] - v[2]),
      Math.hypot(v[6] - v[0], v[7] - v[1], v[8] - v[2]),
      Math.hypot(v[6] - v[3], v[7] - v[4], v[8] - v[5]),
    )
    const steps = Math.min(MAX_STEPS, Math.ceil(edge / res))
    if (steps <= 1) {
      add(v[0], v[1], v[2])
      add(v[3], v[4], v[5])
      add(v[6], v[7], v[8])
      add((v[0] + v[3] + v[6]) / 3, (v[1] + v[4] + v[7]) / 3, (v[2] + v[5] + v[8]) / 3)
      continue
    }
    // Barycentric grid over the triangle.
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; b <= steps - a; b++) {
        const u = a / steps
        const w = b / steps
        add(
          v[0] + u * (v[3] - v[0]) + w * (v[6] - v[0]),
          v[1] + u * (v[4] - v[1]) + w * (v[7] - v[1]),
          v[2] + u * (v[5] - v[2]) + w * (v[8] - v[2]),
        )
      }
    }
  }
  return new Float32Array(out)
}
