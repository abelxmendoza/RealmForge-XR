import { describe, expect, it } from 'vitest'
import type { WorldObject } from '../world/types'
import { WORLD } from '../world/types'
import { SNAP, SNAP_ANGLE } from '../world/snap'
import { MIN_HEIGHT, MIN_SIZE, grabPatch, samePatch } from './grab'

const wall: WorldObject = { id: 'w', kind: 'wall', position: [0, 0, 0], size: [6, 1.6, 0.5], rotationY: 0 }
const onGrid = (v: number, step = SNAP) => Math.abs(v / step - Math.round(v / step)) < 1e-9

describe('grabPatch', () => {
  it('one-hand grab with snap moves to the grid and never resizes', () => {
    const p = grabPatch(wall, { x: 1.13, z: -2.37, rotationY: 0.02, scale: 1 }, true)
    expect(p.size).toEqual(wall.size)
    expect(p.rotationY).toBe(0)
    // Axis-aligned, so the footprint edges (not just the centre) sit on grid lines.
    expect(onGrid(p.position[0] - p.size[0] / 2)).toBe(true)
    expect(onGrid(p.position[2] - p.size[2] / 2)).toBe(true)
  })

  it('snaps yaw to 15° steps', () => {
    const p = grabPatch(wall, { x: 0, z: 0, rotationY: 0.5, scale: 1 }, true)
    expect(onGrid(p.rotationY, SNAP_ANGLE)).toBe(true)
    expect(p.rotationY).toBeCloseTo(SNAP_ANGLE * 2)
  })

  it('two-hand scale is uniform and snaps sizes', () => {
    const b: WorldObject = { ...wall, kind: 'building', size: [2, 3, 2] }
    const p = grabPatch(b, { x: 0, z: 0, rotationY: 0, scale: 1.6 }, true)
    expect(p.size[0]).toBe(p.size[2])
    expect(onGrid(p.size[0])).toBe(true)
    expect(onGrid(p.size[1], 0.25)).toBe(true)
    expect(p.size[0]).toBeGreaterThan(b.size[0])
    expect(p.size[1]).toBeGreaterThan(b.size[1])
  })

  it('without snap passes values through, keeping minimum sizes', () => {
    const p = grabPatch(wall, { x: 1.13, z: -2.37, rotationY: 0.5, scale: 0.01 }, false)
    expect(p.position).toEqual([1.13, 0, -2.37])
    expect(p.rotationY).toBe(0.5)
    expect(p.size).toEqual([MIN_SIZE, MIN_HEIGHT, MIN_SIZE])
  })

  it('keeps objects on the ground and inside the map', () => {
    const raised: WorldObject = { ...wall, position: [0, 0.25, 0] }
    const p = grabPatch(raised, { x: 50, z: -50, rotationY: 0, scale: 1 }, false)
    expect(p.position).toEqual([WORLD.half, 0.25, -WORLD.half])
  })
})

describe('samePatch', () => {
  it('detects unchanged patches so snapped grabs skip replans', () => {
    const a = grabPatch(wall, { x: 1.1, z: 0, rotationY: 0, scale: 1 }, true)
    const b = grabPatch(wall, { x: 1.2, z: 0, rotationY: 0.01, scale: 1 }, true)
    expect(samePatch(undefined, a)).toBe(false)
    expect(samePatch(a, b)).toBe(true)
    expect(samePatch(a, grabPatch(wall, { x: 3, z: 0, rotationY: 0, scale: 1 }, true))).toBe(false)
  })
})
