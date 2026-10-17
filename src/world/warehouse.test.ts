import { describe, expect, it } from 'vitest'
import { blocksNavigation, navObstacles, type WorldObject } from './types'
import { cycleVariant, equipmentSize } from './catalog'
import { PALLET, RACK, rackBeamHeights } from './scale'
import { parseWorld, serializeWorld } from './serialize'
import { warehouse } from './presets'
import { idFor } from './store'
import { buildGrid, isBlocked, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'
import { palletGeometry, rackBays, rackGeometry } from '../scene/structures/warehouseGeometry'

const pallet = (extra: Partial<WorldObject> = {}): WorldObject => ({
  id: 'pallet-1', kind: 'pallet', position: [0, 0, 0], size: equipmentSize('pallet', 'boxes'), rotationY: 0, style: 'boxes', ...extra,
})
const rack = (extra: Partial<WorldObject> = {}): WorldObject => ({
  id: 'rack-1', kind: 'rack', position: [5, 0, 0], size: [RACK.bay * 3, 6, RACK.depth], rotationY: 0, style: 'loaded', ...extra,
})

describe('pallets and racks: data', () => {
  it('use real sizes and block the robot', () => {
    expect(pallet().size).toEqual([1.2, 1.35, 1.0])
    expect(equipmentSize('pallet', 'empty')[1]).toBe(PALLET.height)
    expect(blocksNavigation(pallet())).toBe(true)
    expect(blocksNavigation(rack())).toBe(true)
  })

  it('cycling a pallet changes its load and height, not its footprint', () => {
    const next = cycleVariant(pallet())!
    expect(next.style).toBe('wrapped')
    expect(next.size).toEqual([1.2, PALLET.heightFor.wrapped, 1.0])
    expect(cycleVariant(pallet({ style: 'wrapped', size: [1.2, 1.5, 1] }))!.size![1]).toBe(PALLET.height)
    expect(cycleVariant(rack())!.style).toBe('empty')
  })

  it('survive a save → load round trip', () => {
    const file = serializeWorld({ objects: [pallet(), rack({ style: 'empty' })], robotStart: [0, 5], goal: null }, 'Warehouse test')
    const r = parseWorld(JSON.parse(JSON.stringify(file)), idFor)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.world.objects.map((o) => [o.kind, o.style])).toEqual([
      ['pallet', 'boxes'],
      ['rack', 'empty'],
    ])
  })
})

describe('pallets and racks: geometry stays cheap', () => {
  it('a pallet is a few merged meshes', () => {
    const g = palletGeometry('wrapped')
    expect(g.parts).toBeGreaterThan(20) // boards, blocks, cartons, wrap…
    expect(g.wood && g.load && g.wrap).toBeTruthy() // …merged into three geometries
  })

  it('a rack run is split into bays with a beam level every 1.5 m', () => {
    expect(rackBays(16.2)).toBe(6)
    expect(rackBeamHeights(6)).toEqual([1.5, 3, 4.5])
    const g = rackGeometry(16.2, 6, RACK.depth, 'loaded')
    expect(g.levels).toBe(4)
    expect(g.wood).not.toBeNull()
    expect(rackGeometry(16.2, 6, RACK.depth, 'empty').wood).toBeNull()
  })
})

describe('Warehouse preset', () => {
  const world = warehouse()

  it('is built from real racks and pallets', () => {
    expect(world.objects.filter((o) => o.kind === 'rack').length).toBeGreaterThanOrEqual(8)
    expect(world.objects.filter((o) => o.kind === 'pallet').length).toBeGreaterThanOrEqual(10)
  })

  it('racks block, and the robot reaches the dock down the aisle', () => {
    const g = buildGrid(navObstacles(world.objects))
    const r = world.objects.find((o) => o.kind === 'rack')!
    expect(isBlocked(g, ...worldToCell(g, [r.position[0], r.position[2]]))).toBe(true)
    expect(planPath(g, world.robotStart, world.goal!)).not.toBeNull()
  })
})
