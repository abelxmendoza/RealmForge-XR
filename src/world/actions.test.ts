import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from './store'
import { useEnvironment } from './environment'
import { installHistory, clearHistory, withHistorySuppressed } from './history'
import { markClean, saveWorld, useWorldLibrary } from './persistence'
import { startNavigation, useNav } from '../nav/navigation'
import {
  worldActions,
  createObject,
  deleteObject,
  setTool,
  setGoal,
  placeRobot,
  loadEnvironmentAction,
  loadSavedWorldAction,
  undo,
  redo,
  objectCount,
} from './actions'

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

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  installHistory()
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 5], goal: [0, -5] })
  })
  clearHistory()
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  useEnvironment.getState().setActive(null)
  markClean()
})

describe('worldActions facade', () => {
  it('selects tools and mutates objects through the existing store', () => {
    setTool('wall')
    expect(useWorld.getState().tool).toBe('wall')
    expect(worldActions.getTool()).toBe('wall')

    const id = createObject({
      kind: 'building',
      position: [1, 0, 1],
      size: [2, 2, 2],
      rotationY: 0,
      style: 'office',
    })
    expect(useWorld.getState().objects[id]).toBeTruthy()
    expect(objectCount()).toBe(1)

    worldActions.updateObject(id, { position: [2, 0, 2] })
    expect(useWorld.getState().objects[id].position).toEqual([2, 0, 2])

    deleteObject(id)
    expect(useWorld.getState().objects[id]).toBeUndefined()
  })

  it('places robot and goal and triggers navigation replan', () => {
    startNavigation()
    const before = useNav.getState().replanCount
    placeRobot([-4, 4])
    setGoal([4, -4])
    expect(useWorld.getState().robotStart).toEqual([-4, 4])
    expect(useWorld.getState().goal).toEqual([4, -4])
    // robotVersion / goal changes cause replan
    expect(useNav.getState().replanCount).toBeGreaterThanOrEqual(before)
  })

  it('loads environments via the stable API', async () => {
    const listed = worldActions.listEnvironments()
    expect(listed.map((e) => e.id)).toContain('mars-outpost')

    const r = await loadEnvironmentAction('mars-outpost')
    expect(r.ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(objectCount()).toBeGreaterThan(5)
  })

  it('requires confirmReplace for environment replace on a non-empty world', async () => {
    createObject({ kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 })
    const denied = await loadEnvironmentAction('warehouse')
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.cancelled).toBe(true)

    const cancelled = await loadEnvironmentAction('warehouse', { confirmReplace: no })
    expect(cancelled.ok).toBe(false)

    const ok = await loadEnvironmentAction('warehouse', { confirmReplace: yes })
    expect(ok.ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('warehouse')
  })

  it('supports undo/redo through the facade', () => {
    const id = createObject({
      kind: 'crate',
      position: [0, 0, 0],
      size: [1, 1, 1],
      rotationY: 0,
      solid: true,
    })
    expect(useWorld.getState().objects[id]).toBeTruthy()
    expect(undo()).toBe(true)
    expect(useWorld.getState().objects[id]).toBeUndefined()
    expect(redo()).toBe(true)
    expect(useWorld.getState().objects[id]).toBeTruthy()
  })

  it('saves and loads worlds with XR-safe confirm', async () => {
    await loadEnvironmentAction('forge-district')
    const saved = saveWorld('Action API city')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    useWorld.getState().loadWorld({
      objects: [{ id: 'wall-temp', kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 }],
      robotStart: [0, 0],
      goal: null,
    })

    const blocked = await loadSavedWorldAction(saved.value.id)
    expect(blocked.ok).toBe(false)

    const loaded = await loadSavedWorldAction(saved.value.id, { confirmReplace: yes })
    expect(loaded.ok).toBe(true)
    expect(useWorld.getState().objects['wall-temp']).toBeUndefined()
    expect(objectCount()).toBeGreaterThan(5)
  })

  it('keeps desktop store identity (no second store)', () => {
    worldActions.setTool('building')
    expect(useWorld.getState().tool).toBe('building')
    useWorld.getState().setTool('select')
    expect(worldActions.getTool()).toBe('select')
  })
})
