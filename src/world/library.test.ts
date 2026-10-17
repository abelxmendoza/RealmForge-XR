import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from './store'
import { useEnvironment } from './environment'
import { useWorldLibrary, listSavedWorlds, saveWorld, deleteSavedWorld, thumbnailKey } from './persistence'
import {
  captureActiveThumbnail,
  createWorld,
  duplicateWorld,
  getThumbnail,
  installThumbnailTracking,
  listTemplates,
  listWorlds,
  nextWorldName,
  openWorld,
  registerThumbnailCapture,
  startFromTemplate,
} from './library'
import { worldActions } from './actions'

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

let mem: MemoryStorage
const yes = () => true
const no = () => false
const PNG = 'data:image/jpeg;base64,AAAA'

beforeEach(() => {
  mem = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = mem
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  useEnvironment.getState().setActive(null)
  registerThumbnailCapture(null)
})

describe('world library', () => {
  it('offers a blank template plus every environment', () => {
    const ids = listTemplates().map((t) => t.id)
    expect(ids[0]).toBe('blank')
    expect(ids).toEqual(
      expect.arrayContaining(['forge-district', 'mars-outpost', 'warehouse', 'empty-event-venue', 'job-fair']),
    )
  })

  it('creates a blank world and saves it to the library', async () => {
    const r = await createWorld('Sandbox', 'blank')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
    expect(useWorld.getState().goal).toBeNull()
    expect(useWorldLibrary.getState()).toMatchObject({ activeId: r.value.id, activeName: 'Sandbox', dirty: false })
    expect(listSavedWorlds().map((w) => w.name)).toEqual(['Sandbox'])
    expect(useEnvironment.getState().activeId).toBeNull()
  })

  it('creates a world from an environment template', async () => {
    const r = await createWorld('Red planet', 'mars-outpost')
    expect(r.ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(5)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(useWorldLibrary.getState().activeName).toBe('Red planet')
    // The environment is remembered in the save, so reopening restores its look.
    const raw = JSON.parse(mem.getItem(`realmforge.world.v1.${r.ok && r.value.id}`)!)
    expect(raw.environmentId).toBe('mars-outpost')
  })

  it('asks before replacing a non-empty world, and cancelling changes nothing', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 })
    const r = await createWorld('Nope', 'blank', { confirmReplace: no })
    expect(r.ok).toBe(false)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(1)
    expect(listSavedWorlds()).toHaveLength(0)
    expect((await createWorld('Yes', 'blank', { confirmReplace: yes })).ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
  })

  it('names new worlds without clashing', async () => {
    expect(nextWorldName()).toBe('My world')
    await createWorld('', 'blank')
    expect(nextWorldName()).toBe('My world 2')
    await createWorld('', 'blank', { confirmReplace: yes })
    expect(listSavedWorlds().map((w) => w.name).sort()).toEqual(['My world', 'My world 2'])
  })

  it('copies a saved world without touching the active one, and opens it later', async () => {
    const a = await createWorld('Original', 'forge-district')
    if (!a.ok) throw new Error(a.error)
    mem.setItem(thumbnailKey(a.value.id), PNG)
    const count = Object.keys(useWorld.getState().objects).length
    const copy = duplicateWorld(a.value.id)
    expect(copy.ok).toBe(true)
    if (!copy.ok) return
    expect(copy.value.name).toBe('Copy of Original')
    expect(copy.value.objectCount).toBe(count)
    expect(getThumbnail(copy.value.id)).toBe(PNG)
    expect(useWorldLibrary.getState().activeId).toBe(a.value.id)

    await createWorld('Other', 'blank', { confirmReplace: yes })
    expect((await openWorld(copy.value.id, { confirmReplace: yes })).ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(count)
    expect(useEnvironment.getState().activeId).toBe('forge-district')
  })

  it('filters by name and deletes thumbnails with the world', async () => {
    const a = await createWorld('Harbor', 'blank')
    await createWorld('Hilltop', 'blank', { confirmReplace: yes })
    expect(listWorlds('harb').map((w) => w.name)).toEqual(['Harbor'])
    if (!a.ok) return
    mem.setItem(thumbnailKey(a.value.id), PNG)
    expect(deleteSavedWorld(a.value.id).ok).toBe(true)
    expect(getThumbnail(a.value.id)).toBeNull()
  })

  it('captures a thumbnail after any save', () => {
    registerThumbnailCapture(() => PNG)
    const stop = installThumbnailTracking((fn) => fn())
    const r = saveWorld('Snap')
    stop()
    expect(r.ok && getThumbnail(r.value.id)).toBe(PNG)
    useWorldLibrary.setState({ activeId: null })
    expect(captureActiveThumbnail()).toBe(false)
  })

  it('start screen swaps in a template without saving or asking', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [2, 1, 0.3], rotationY: 0 })
    expect((await startFromTemplate('warehouse')).ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('warehouse')
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(3)
    expect((await startFromTemplate('blank')).ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
    expect(useEnvironment.getState().activeId).toBeNull()
    expect(listSavedWorlds()).toHaveLength(0)
    expect(useWorldLibrary.getState().dirty).toBe(false)
  })

  it('is reachable through worldActions for the XR menu and voice', async () => {
    // blank + forge/mars/warehouse + empty-event-venue + job-fair
    expect(worldActions.listTemplates().length).toBe(6)
    const r = await worldActions.createWorld('From XR', 'warehouse')
    expect(r.ok).toBe(true)
  })
})
