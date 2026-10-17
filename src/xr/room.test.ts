import { describe, expect, it } from 'vitest'
import { blockMove, collides, pointInPolygon, restHeight, type RoomObstacle, type RoomSurface } from './room'

const square = (x: number, z: number, h: number) => [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]] as [number, number][]
const table: RoomSurface = { label: 'table', y: 0.75, polygon: square(1, 0, 0.5) }
const shelf: RoomSurface = { label: 'shelf', y: 1.9, polygon: square(1, 0, 0.5) }

describe('real surfaces: resting', () => {
  it('finds whether a point is inside an outline', () => {
    expect(pointInPolygon([1, 0], table.polygon)).toBe(true)
    expect(pointInPolygon([2, 0], table.polygon)).toBe(false)
  })
  it('rests on the table under the point, else the floor', () => {
    expect(restHeight([1.2, 0.1], 1.6, [table], 0)).toBe(0.75)
    expect(restHeight([3, 0], 1.6, [table], 0)).toBe(0)
  })
  it('ignores surfaces above your eyes (a high shelf over the table)', () => {
    expect(restHeight([1, 0], 1.6, [table, shelf], 0)).toBe(0.75)
  })
})

describe('real surfaces: blocking', () => {
  const wall: RoomObstacle = { kind: 'segment', label: 'wall', a: [2, -5], b: [2, 5] }
  const couch: RoomObstacle = { kind: 'box', label: 'couch', min: [-1, -1], max: [0, 1], top: 0.45 }

  it('stops a footprint just before a wall', () => {
    const [x] = blockMove([0.5, 0], [3, 0], 0.2, 0, [wall])
    expect(x).toBeLessThan(1.81)
    expect(x).toBeGreaterThan(1.6)
  })
  it('lets moves that never reach a wall through untouched', () => {
    expect(blockMove([0.5, 0], [1, 0.5], 0.2, 0, [wall])).toEqual([1, 0.5])
  })
  it('blocks at furniture, unless the object sits on top of it', () => {
    expect(collides([-0.5, 0], 0.1, 0, [couch])).toBe(true)
    expect(collides([-0.5, 0], 0.1, 0.45, [couch])).toBe(false)
  })
  it('never traps an object that already overlaps something', () => {
    expect(blockMove([-0.5, 0], [-0.4, 0], 0.1, 0, [couch])).toEqual([-0.4, 0])
  })
})
