import { beforeEach, describe, expect, it } from 'vitest'
import { forgeDistrict, marsOutpost, warehouse, PRESETS } from './presets'
import {
  ENVIRONMENT_IDS,
  ENVIRONMENTS,
  getEnvironment,
  listEnvironments,
  loadEnvironment,
  useEnvironment,
  DEFAULT_APPEARANCE,
} from './environment'
import { WORLD, blocksNavigation, navObstacles, type WorldObject } from './types'
import { useWorld } from './store'
import { buildGrid, isBlocked, pathIsClear, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'
import { startNavigation, useNav } from '../nav/navigation'
import { useEditor } from '../editor/settings'
import { exportWorld, importWorld, saveWorld, loadSavedWorld, listSavedWorlds } from './persistence'

/** In-memory localStorage so replaceWorld/confirm paths work in Node. */
class MemoryStorage {
  data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v))
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  clear() {
    this.data.clear()
  }
}

const yes = () => true
const no = () => false

function assertNavigable(world: { objects: WorldObject[]; robotStart: [number, number]; goal: [number, number] | null }) {
  expect(world.goal).not.toBeNull()
  const ids = world.objects.map((o) => o.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const o of world.objects) {
    expect(o.id.length).toBeGreaterThan(0)
    expect(Math.abs(o.position[0])).toBeLessThanOrEqual(WORLD.half)
    expect(Math.abs(o.position[2])).toBeLessThanOrEqual(WORLD.half)
  }
  const g = buildGrid(navObstacles(world.objects))
  expect(isBlocked(g, ...worldToCell(g, world.robotStart))).toBe(false)
  expect(isBlocked(g, ...worldToCell(g, world.goal!))).toBe(false)
  const path = planPath(g, world.robotStart, world.goal!)
  expect(path).not.toBeNull()
  expect(pathIsClear(g, path!)).toBe(true)
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
})

describe('environment registry', () => {
  it('lists the three hackathon environments', () => {
    expect(ENVIRONMENT_IDS).toEqual(['forge-district', 'mars-outpost', 'warehouse'])
    expect(listEnvironments().map((e) => e.id)).toEqual(ENVIRONMENT_IDS)
    expect(PRESETS.map((p) => p.id)).toEqual(ENVIRONMENT_IDS)
  })

  it('keeps appearance separate from world objects', () => {
    const mars = getEnvironment('mars-outpost')!
    const world = mars.buildWorld()
    expect(mars.appearance.groundColor).not.toEqual(DEFAULT_APPEARANCE.groundColor)
    expect(JSON.stringify(world)).not.toMatch(/hemiSky|groundColor|background/)
  })
})

describe.each([
  ['forge-district', forgeDistrict],
  ['mars-outpost', marsOutpost],
  ['warehouse', warehouse],
] as const)('preset %s', (id, build) => {
  it('loads with unique ids and a clear path', () => {
    assertNavigable(build())
    expect(ENVIRONMENTS[id].buildWorld().objects.length).toBeGreaterThan(5)
  })

  it('marks decorations non-blocking unless solid', () => {
    const world = build()
    for (const o of world.objects) {
      if (o.kind === 'tree' || o.kind === 'streetlight') expect(blocksNavigation(o)).toBe(false)
      if (o.kind === 'crate' && o.solid) expect(blocksNavigation(o)).toBe(true)
      if (o.kind === 'building' || o.kind === 'wall') expect(blocksNavigation(o)).toBe(true)
    }
  })
})

describe('loadEnvironment', () => {
  it('replaces the world, updates appearance, and applies brush defaults', async () => {
    useWorld.getState().loadWorld({
      objects: [{ id: 'wall-keep', kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 }],
      robotStart: [0, 5],
      goal: [0, -5],
    })
    const r = await loadEnvironment('mars-outpost', { confirmReplace: yes })
    expect(r.ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(useEnvironment.getState().appearance.groundColor).toBe(ENVIRONMENTS['mars-outpost'].appearance.groundColor)
    expect(useWorld.getState().robotStart).toEqual(marsOutpost().robotStart)
    expect(useEditor.getState().buildingStyle).toBe('industrial')
    expect(useEditor.getState().wallMaterial).toBe('metal')
  })

  it('does not destroy the current world when confirmation is cancelled', async () => {
    useWorld.getState().loadWorld({
      objects: [{ id: 'wall-keep', kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 }],
      robotStart: [1, 1],
      goal: [2, 2],
    })
    const r = await loadEnvironment('warehouse', { confirmReplace: no })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBe(true)
    expect(useWorld.getState().objects['wall-keep']).toBeTruthy()
    expect(useEnvironment.getState().activeId).toBeNull()
  })

  it('rejects unknown ids', async () => {
    const r = await loadEnvironment('atlantis')
    expect(r.ok).toBe(false)
  })

  it('refuses a non-empty replace when confirmReplace is omitted (no window.confirm)', async () => {
    useWorld.getState().loadWorld({
      objects: [{ id: 'wall-keep', kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 }],
      robotStart: [0, 5],
      goal: [0, -5],
    })
    const r = await loadEnvironment('forge-district')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBe(true)
    expect(useWorld.getState().objects['wall-keep']).toBeTruthy()
  })

  it('loads into an empty world without requiring confirmReplace', async () => {
    const r = await loadEnvironment('mars-outpost')
    expect(r.ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
  })

  it('keeps navigation and replanning after a switch', async () => {
    startNavigation()
    const before = useNav.getState().replanCount
    expect((await loadEnvironment('warehouse', { confirmReplace: yes })).ok).toBe(true)
    expect(useNav.getState().replanCount).toBeGreaterThan(before)
    expect(useNav.getState().status).toBe('moving')

    const count = useNav.getState().replanCount
    const id = Object.keys(useWorld.getState().objects).find((k) => useWorld.getState().objects[k].kind === 'wall')
    if (id) useWorld.getState().updateObject(id, { position: [1, 0, 1] })
    else {
      // warehouse may have walls; if not, add one
      useWorld.getState().addObject({ kind: 'wall', position: [1, 0, 1], size: [2, 1.5, 0.3], rotationY: 0 })
    }
    expect(useNav.getState().replanCount).toBe(count + 1)
  })

  it('still allows worldbuilding tools after loading', async () => {
    expect((await loadEnvironment('forge-district', { confirmReplace: yes })).ok).toBe(true)
    const id = useWorld.getState().addObject({
      kind: 'building',
      position: [0, 0, 0],
      size: [2, 2, 2],
      rotationY: 0,
      style: 'house',
    })
    expect(useWorld.getState().objects[id].kind).toBe('building')
    useWorld.getState().setTool('wall')
    expect(useWorld.getState().tool).toBe('wall')
  })

  it('stays compatible with world persistence save / load / export', async () => {
    expect((await loadEnvironment('warehouse', { confirmReplace: yes })).ok).toBe(true)
    const saved = saveWorld('Warehouse run')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const { json } = exportWorld('Warehouse run')
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    expect((await importWorld(json, { confirmReplace: yes })).ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(5)
    expect(listSavedWorlds().some((w) => w.name === 'Warehouse run')).toBe(true)
    expect((await loadSavedWorld(saved.value.id, { confirmReplace: yes })).ok).toBe(true)
  })
})
