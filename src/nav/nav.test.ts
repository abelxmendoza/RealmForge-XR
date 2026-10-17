import { describe, expect, it } from 'vitest'
import { buildGrid, isBlocked, pathIsClear, worldToCell } from './grid'
import { planPath } from './astar'
import type { WorldObject } from '../world/types'

const wall = (x: number, z: number, w: number, d: number, rotationY = 0): WorldObject => ({
  id: `w${x}${z}`, kind: 'wall', position: [x, 0, z], size: [w, 1, d], rotationY,
})

describe('occupancy grid', () => {
  it('marks cells under an obstacle, inflated by robot radius', () => {
    const g = buildGrid([wall(0, 0, 2, 2)], { inflate: 0 })
    expect(isBlocked(g, ...worldToCell(g, [0, 0]))).toBe(true)
    expect(isBlocked(g, ...worldToCell(g, [0.9, 0.9]))).toBe(true)
    expect(isBlocked(g, ...worldToCell(g, [1.6, 0]))).toBe(false)
    const inflated = buildGrid([wall(0, 0, 2, 2)], { inflate: 0.5 })
    expect(isBlocked(inflated, ...worldToCell(inflated, [1.3, 0]))).toBe(true)
  })

  it('respects rotation', () => {
    // A long thin wall along x, rotated 90° so it runs along z.
    const g = buildGrid([wall(0, 0, 6, 1, Math.PI / 2)], { inflate: 0 })
    expect(isBlocked(g, ...worldToCell(g, [0, 2.5]))).toBe(true)
    expect(isBlocked(g, ...worldToCell(g, [2.5, 0]))).toBe(false)
  })
})

describe('planPath', () => {
  it('goes straight with no obstacles', () => {
    const g = buildGrid([])
    const p = planPath(g, [-5, 0], [5, 0])!
    expect(p).toHaveLength(2)
  })

  it('routes around a wall and the result is collision-free', () => {
    const g = buildGrid([wall(0, 0, 0.5, 10)])
    const p = planPath(g, [-5, 0], [5, 0])!
    expect(p.length).toBeGreaterThan(2)
    expect(pathIsClear(g, p)).toBe(true)
  })

  it('returns null when the goal is sealed off', () => {
    const box = [wall(5, 3, 4, 0.5), wall(5, 7, 4, 0.5), wall(3, 5, 0.5, 4), wall(7, 5, 0.5, 4)]
    const g = buildGrid(box)
    expect(planPath(g, [-5, -5], [5, 5])).toBeNull()
  })

  it('detects that a moved wall invalidates the old route', () => {
    const before = planPath(buildGrid([]), [-5, 0], [5, 0])!
    expect(pathIsClear(buildGrid([wall(0, 0, 0.5, 6)]), before)).toBe(false)
  })
})
