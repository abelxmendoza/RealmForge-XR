import { describe, expect, it } from 'vitest'
import { WORLD, blocksNavigation, navObstacles, type WorldObject } from './types'
import { snapAngle, snapFootprint, snapSize } from './snap'
import { cycleVariant } from './catalog'
import { forgeDistrict } from './presets'
import { useWorld } from './store'
import { buildGrid, isBlocked, pathIsClear, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'

const o = (kind: WorldObject['kind'], extra: Partial<WorldObject> = {}): WorldObject => ({
  id: kind, kind, position: [0, 0, 0], size: [1, 1, 1], rotationY: 0, ...extra,
})

describe('blocksNavigation', () => {
  it('walls and buildings block, decorations do not unless solid', () => {
    expect(blocksNavigation(o('wall'))).toBe(true)
    expect(blocksNavigation(o('building'))).toBe(true)
    expect(blocksNavigation(o('tree'))).toBe(false)
    expect(blocksNavigation(o('streetlight'))).toBe(false)
    expect(blocksNavigation(o('crate'))).toBe(false)
    expect(blocksNavigation(o('crate', { solid: true }))).toBe(true)
  })

  it('low platforms are walkable, tall ones block', () => {
    expect(blocksNavigation(o('platform', { size: [4, 0.05, 4] }))).toBe(false)
    expect(blocksNavigation(o('platform', { size: [4, 0.8, 4] }))).toBe(true)
  })

  it('a tree does not change the grid, a solid crate does', () => {
    const tree = o('tree', { size: [2, 2, 2] })
    expect(isBlocked(buildGrid(navObstacles([tree])), ...worldToCell(buildGrid([]), [0, 0]))).toBe(false)
    const g = buildGrid(navObstacles({ c: o('crate', { solid: true, size: [2, 1, 2] }) }))
    expect(isBlocked(g, ...worldToCell(g, [0, 0]))).toBe(true)
  })
})

describe('snapping', () => {
  it('aligns footprint edges to the grid when axis-aligned', () => {
    // 3 wide: edges should land on 0.5 lines, so the centre sits at .0 or .5 offsets of 1.5.
    const [x, z] = snapFootprint([0.2, 0.9], 3, 2, 0)
    expect((x - 1.5) % 0.5).toBeCloseTo(0)
    expect((z - 1) % 0.5).toBeCloseTo(0)
    // Rotated 90°: width and depth swap.
    const [x2] = snapFootprint([0.2, 0], 3, 2, Math.PI / 2)
    expect(Math.abs(x2 % 0.5)).toBeCloseTo(0)
  })

  it('snaps angles to 15° and sizes to at least one step', () => {
    expect(snapAngle(0.3)).toBeCloseTo(Math.PI / 12)
    expect(snapSize(0.1)).toBe(0.5)
    expect(snapSize(1.3)).toBe(1.5)
  })
})

describe('store editing', () => {
  it('duplicates an object with a new id and selects the copy', () => {
    const w = useWorld.getState()
    const id = w.addObject({ kind: 'building', position: [0, 0, 0], size: [2, 3, 2], rotationY: 0.5, style: 'tower' })
    const before = useWorld.getState().geometryVersion
    const copy = useWorld.getState().duplicateObject(id)!
    const s = useWorld.getState()
    expect(copy).not.toBe(id)
    expect(s.selectedId).toBe(copy)
    expect(s.objects[copy]).toMatchObject({ kind: 'building', size: [2, 3, 2], rotationY: 0.5, style: 'tower' })
    expect(s.objects[copy].position).not.toEqual(s.objects[id].position)
    expect(s.geometryVersion).toBe(before + 1)
  })

  it('cycles building styles and wall materials', () => {
    expect(cycleVariant(o('building', { style: 'office' }))?.style).toBe('house')
    expect(cycleVariant(o('wall'))?.material).toBe('brick')
    expect(cycleVariant(o('streetlight'))).toBeNull()
  })
})

describe('Forge District preset', () => {
  const world = forgeDistrict()

  it('has unique ids and stays inside the map', () => {
    expect(new Set(world.objects.map((x) => x.id)).size).toBe(world.objects.length)
    for (const x of world.objects) {
      expect(Math.abs(x.position[0])).toBeLessThanOrEqual(WORLD.half)
      expect(Math.abs(x.position[2])).toBeLessThanOrEqual(WORLD.half)
    }
  })

  it('keeps the robot start and goal free and connected', () => {
    const g = buildGrid(navObstacles(world.objects))
    expect(isBlocked(g, ...worldToCell(g, world.robotStart))).toBe(false)
    expect(isBlocked(g, ...worldToCell(g, world.goal!))).toBe(false)
    const path = planPath(g, world.robotStart, world.goal!)
    expect(path).not.toBeNull()
    expect(pathIsClear(g, path!)).toBe(true)
  })

  it('loads into the store and replaces the world', () => {
    useWorld.getState().loadWorld(world)
    const s = useWorld.getState()
    expect(Object.keys(s.objects)).toHaveLength(world.objects.length)
    expect(s.robotStart).toEqual(world.robotStart)
    expect(s.goal).toEqual(world.goal)
  })
})
