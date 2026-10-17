import { describe, expect, it } from 'vitest'
import { floorHeight } from './floor'

describe('floor height', () => {
  it('prefers a detected floor plane, then local-floor, then 0', () => {
    expect(floorHeight({ localFloorY: -1.3, floorPlaneYs: [-1.32] })).toBe(-1.32)
    expect(floorHeight({ localFloorY: -1.3, floorPlaneYs: [] })).toBe(-1.3)
    expect(floorHeight({ localFloorY: null, floorPlaneYs: [] })).toBe(0)
  })

  it('uses the lowest floor plane when there are several (a rug or step is not the floor)', () => {
    expect(floorHeight({ localFloorY: 0, floorPlaneYs: [-0.02, -0.05, 0.1] })).toBe(-0.05)
  })

  it('ignores a non-finite local-floor reading', () => {
    expect(floorHeight({ localFloorY: Number.NaN, floorPlaneYs: [] })).toBe(0)
  })
})
