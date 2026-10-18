import { describe, expect, it } from 'vitest'
import { analyzeTriangles, fitPosition, guessUnit, scaleFromMeasurement } from './analyze'

type P = [number, number, number]

/** Two triangles for a quad a-b-c-d. */
const quad = (a: P, b: P, c: P, d: P) => [...a, ...b, ...c, ...a, ...c, ...d]

/**
 * A 12 × 8 m room with 3 m walls, turned `deg` degrees and saved in `unit`s per metre (100 = cm),
 * floor at `floor` metres, with a ceiling and a small bit of noise below the floor.
 */
function room(deg: number, unit: number, floor: number) {
  const r = (deg * Math.PI) / 180
  const tf = ([x, y, z]: P): P => [
    (x * Math.cos(r) + z * Math.sin(r) + 3) * unit,
    (y + floor) * unit,
    (-x * Math.sin(r) + z * Math.cos(r) - 2) * unit,
  ]
  const q = (...pts: P[]) => quad(...(pts.map(tf) as [P, P, P, P]))
  const [w, d, h] = [6, 4, 3]
  return new Float32Array([
    ...q([-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]),
    ...q([-w, h, -d], [-w, h, d], [w, h, d], [w, h, -d]),
    ...q([-w, 0, -d], [-w, h, -d], [w, h, -d], [w, 0, -d]),
    ...q([-w, 0, d], [w, 0, d], [w, h, d], [-w, h, d]),
    ...q([-w, 0, -d], [-w, 0, d], [-w, h, d], [-w, h, -d]),
    ...q([w, 0, -d], [w, h, -d], [w, h, d], [w, 0, d]),
    // 20 cm square of scanner noise 30 cm under the floor.
    ...q([0, -0.3, 0], [0.2, -0.3, 0], [0.2, -0.3, 0.2], [0, -0.3, 0.2]),
  ])
}

describe('scan analysis', () => {
  it('finds the floor, not the ceiling or the noise under it', () => {
    const a = analyzeTriangles(room(17, 100, -1.3), 0.01)
    expect(a.floorY).toBeCloseTo(-130, 1)
  })

  it('measures how far the walls are turned from the grid', () => {
    for (const deg of [0, 17, -30, 44]) {
      const a = analyzeTriangles(room(deg, 1, 0))
      expect((a.wallAngle * 180) / Math.PI).toBeCloseTo(deg, 0)
    }
  })

  it('measures the footprint with the walls squared up', () => {
    const a = analyzeTriangles(room(17, 100, -1.3), 0.01)
    expect(a.footprint[0]).toBeCloseTo(1200, -1)
    expect(a.footprint[1]).toBeCloseTo(800, -1)
  })

  it('guesses centimetre and millimetre files', () => {
    expect(guessUnit(analyzeTriangles(room(0, 1, 0)).size)).toBe(1)
    expect(guessUnit(analyzeTriangles(room(0, 100, 0)).size)).toBe(0.01)
    expect(guessUnit(analyzeTriangles(room(0, 1000, 0)).size)).toBe(0.001)
  })

  it('fits the scan so its floor is at y = 0 and its middle is at the origin', () => {
    const a = analyzeTriangles(room(17, 100, -1.3), 0.01)
    const scale = 0.01
    const rot = -a.wallAngle
    const pos = fitPosition(a, scale, rot, [0, 0, 0])
    const place = ([x, y, z]: P): P => [
      pos[0] + (x * Math.cos(rot) + z * Math.sin(rot)) * scale,
      pos[1] + y * scale,
      pos[2] + (-x * Math.sin(rot) + z * Math.cos(rot)) * scale,
    ]
    // Room centre at floor level, in file coordinates.
    const r = (17 * Math.PI) / 180
    const centre: P = [3 * 100, -130, -2 * 100]
    const [x, y, z] = place(centre)
    expect(y).toBeCloseTo(0, 3)
    expect(Math.hypot(x, z)).toBeLessThan(0.05)
    // A floor corner lands on an axis-aligned rectangle corner (±6, ±4).
    const corner: P = [(6 * Math.cos(r) + 4 * Math.sin(r) + 3) * 100, -130, (-6 * Math.sin(r) + 4 * Math.cos(r) - 2) * 100]
    const [cx, , cz] = place(corner)
    expect(Math.abs(cx)).toBeCloseTo(6, 1)
    expect(Math.abs(cz)).toBeCloseTo(4, 1)
  })

  it('rescales from a measured distance', () => {
    expect(scaleFromMeasurement(1, 4, 8)).toBe(2)
    expect(scaleFromMeasurement(0.01, 2.5, 5)).toBeCloseTo(0.02)
    expect(scaleFromMeasurement(1, 0, 5)).toBeNull()
    expect(scaleFromMeasurement(1, 3, -1)).toBeNull()
  })

  it('copes with an empty file', () => {
    expect(analyzeTriangles(new Float32Array(0))).toMatchObject({ triangles: 0, floorY: 0 })
  })
})
