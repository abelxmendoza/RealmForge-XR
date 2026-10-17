import { beforeEach, describe, expect, it } from 'vitest'
import { idFor, newId, useWorld } from './store'
import { parseWorld, serializeWorld, WORLD_FORMAT, WORLD_VERSION } from './serialize'
import {
  deleteSavedWorld,
  exportWorld,
  importWorld,
  listSavedWorlds,
  loadSavedWorld,
  markClean,
  quickSave,
  refreshDirty,
  renameSavedWorld,
  saveWorld,
  useWorldLibrary,
} from './persistence'
import { forgeDistrict } from './presets'
import { WORLD, type WorldObject } from './types'
import { startNavigation, useNav } from '../nav/navigation'
import { isBlocked, worldToCell } from '../nav/grid'

/** In-memory localStorage stand-in (vitest runs in Node). */
class MemoryStorage {
  data = new Map<string, string>()
  failWrites = false
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
    if (this.failWrites) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
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

const sample = (): WorldObject[] => [
  { id: 'bld-a', kind: 'building', position: [2, 0, 3], size: [3, 4, 2], rotationY: 0.5, color: '#b9cde0', style: 'tower', roof: 'flat' },
  { id: 'bld-b', kind: 'building', position: [-4, 0, -4], size: [2.5, 2, 2.5], rotationY: Math.PI, style: 'house', roof: 'pitched' },
  { id: 'wall-a', kind: 'wall', position: [0, 0, -6], size: [6, 1.6, 0.5], rotationY: 0, material: 'brick' },
  { id: 'crate-a', kind: 'crate', position: [5, 0, 5], size: [1, 1, 1], rotationY: 0, material: 'metal', solid: true },
  { id: 'tree-a', kind: 'tree', position: [-6, 0, 6], size: [1.2, 2.4, 1.2], rotationY: 0, style: 'pine' },
  { id: 'plat-a', kind: 'platform', position: [0, 0, 0], size: [8, 0.03, 1.6], rotationY: 0, material: 'asphalt', solid: false },
]

beforeEach(() => {
  mem = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = mem
  useWorld.getState().loadWorld({ objects: sample(), robotStart: [-8, 8], goal: [8, -8] })
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

describe('serialization', () => {
  it('writes the versioned format with every schema field', () => {
    const s = useWorld.getState()
    const file = serializeWorld(s, '  My First World  ')
    expect(file.format).toBe(WORLD_FORMAT)
    expect(file.version).toBe(WORLD_VERSION)
    expect(file.name).toBe('My First World')
    expect(file.robotStart).toEqual([-8, 8])
    expect(file.goal).toEqual([8, -8])
    expect(file.objects).toHaveLength(6)
    expect(file.objects.find((o) => o.id === 'bld-b')).toEqual(sample()[1])
    // Editor state never leaks into the file.
    expect(JSON.stringify(file)).not.toMatch(/selectedId|tool|geometryVersion|DOTENV|KAEDIM/)
  })

  it('round-trips styles, roofs, materials and collision flags', () => {
    const json = JSON.stringify(serializeWorld(useWorld.getState(), 'Round trip'))
    const parsed = parseWorld(json, idFor)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.warnings).toEqual([])
    const byId = Object.fromEntries(parsed.world.objects.map((o) => [o.id, o]))
    expect(byId['bld-a']).toMatchObject({ style: 'tower', roof: 'flat', color: '#b9cde0', rotationY: 0.5 })
    expect(byId['bld-b']).toMatchObject({ style: 'house', roof: 'pitched' })
    expect(byId['wall-a'].material).toBe('brick')
    expect(byId['crate-a'].solid).toBe(true)
    expect(byId['plat-a'].solid).toBe(false)
    expect(byId['tree-a'].solid).toBeUndefined()
    expect(parsed.world.objects).toEqual(sample())
  })

  it('round-trips the Forge District preset unchanged', () => {
    const w = forgeDistrict()
    const parsed = parseWorld(JSON.stringify(serializeWorld(w, 'Forge')), idFor)
    expect(parsed.ok && parsed.world.objects).toEqual(w.objects)
  })
})

describe('validation', () => {
  const file = () => JSON.parse(JSON.stringify(serializeWorld(useWorld.getState(), 'V')))
  const bad = (mutate: (f: ReturnType<typeof file>) => unknown) => {
    const f = file()
    const r = mutate(f)
    return parseWorld(r === undefined ? f : r, idFor)
  }

  it('rejects malformed files', () => {
    expect(parseWorld('{not json', idFor).ok).toBe(false)
    expect(parseWorld('[]', idFor).ok).toBe(false)
    expect(bad((f) => void (f.format = 'something-else')).ok).toBe(false)
    expect(bad((f) => void (f.version = 99)).ok).toBe(false)
    expect(bad((f) => void (f.objects = 'nope')).ok).toBe(false)
    expect(bad((f) => void (f.robotStart = ['a', 1])).ok).toBe(false)
    expect(bad((f) => void (f.goal = [1])).ok).toBe(false)
    expect(bad((f) => void (f.objects[0].kind = 'dragon')).ok).toBe(false)
    expect(bad((f) => void (f.objects[0].size = [1, -2, 1])).ok).toBe(false)
    expect(bad((f) => void (f.objects[0].size = [1, 0, 1])).ok).toBe(false)
    expect(bad((f) => void (f.objects[0].position = [1, 'x', 1])).ok).toBe(false)
    expect(bad((f) => void (f.objects[0] = null)).ok).toBe(false)
  })

  it('repairs out-of-range positions and sizes, and drops unknown optional values', () => {
    const r = bad((f) => {
      f.objects[0].position = [500, 0, -500]
      f.objects[0].size = [1000, 2, 1]
      f.objects[0].style = 'castle'
      f.objects[0].solid = 'yes'
      f.robotStart = [99, 99]
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const o = r.world.objects[0]
    expect(o.position).toEqual([40, 0, -40])
    expect(o.size[0]).toBeLessThanOrEqual(WORLD.half * 4)
    expect(o.style).toBeUndefined()
    expect(o.solid).toBeUndefined()
    expect(r.world.robotStart).toEqual([40, 40])
    expect(r.warnings.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps valid ids and replaces duplicate or invalid ones', () => {
    const r = bad((f) => {
      f.objects[1].id = 'bld-a'
      f.objects[2].id = 'bad id with spaces <script>'
      f.objects[3].id = 42
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ids = r.world.objects.map((o) => o.id)
    expect(ids[0]).toBe('bld-a')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[1]).not.toBe('bld-a')
    expect(ids[2]).toMatch(/^wall-\d+$/)
    expect(r.warnings.filter((w) => w.includes('id'))).toHaveLength(3)
  })

  it('accepts [x, y, z] points as well as [x, z]', () => {
    const r = bad((f) => {
      f.robotStart = [1, 0, 2]
      f.goal = null
    })
    expect(r.ok && r.world.robotStart).toEqual([1, 2])
    expect(r.ok && r.world.goal).toBeNull()
  })
})

describe('browser storage', () => {
  it('saves, lists, loads, renames and deletes', async () => {
    const saved = saveWorld('City A')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    expect(listSavedWorlds().map((m) => m.name)).toEqual(['City A'])
    expect(saved.value.objectCount).toBe(6)

    // Change the world, then load the save back.
    useWorld.getState().removeObject('bld-a')
    useWorld.getState().setGoal([0, 0])
    expect((await loadSavedWorld(saved.value.id, { confirmReplace: yes })).ok).toBe(true)
    expect(useWorld.getState().objects['bld-a']).toMatchObject({ style: 'tower' })
    expect(useWorld.getState().goal).toEqual([8, -8])
    expect(useWorldLibrary.getState().activeId).toBe(saved.value.id)

    expect(renameSavedWorld(saved.value.id, 'City B').ok).toBe(true)
    expect(listSavedWorlds()[0].name).toBe('City B')
    expect(useWorldLibrary.getState().activeName).toBe('City B')

    expect(deleteSavedWorld(saved.value.id).ok).toBe(true)
    expect(listSavedWorlds()).toEqual([])
    expect(mem.length).toBe(1) // only the (empty) index remains
  })

  it('never overwrites a save unless confirmed', () => {
    const a = saveWorld('Same name')
    const b = saveWorld('Same name')
    expect(a.ok && b.ok && a.value.id !== b.value.id).toBe(true)
    expect(listSavedWorlds()).toHaveLength(2)
    if (!a.ok) return
    useWorld.getState().removeObject('tree-a')
    // overwriteId without confirmed is refused
    const refused = saveWorld('Updated', { overwriteId: a.value.id })
    expect(refused.ok).toBe(false)
    expect(listSavedWorlds().find((m) => m.id === a.value.id)?.objectCount).toBe(6)
    const c = saveWorld('Updated', { overwriteId: a.value.id, confirmed: true })
    expect(c.ok && c.value.id).toBe(a.value.id)
    expect(listSavedWorlds()).toHaveLength(2)
    expect(listSavedWorlds().find((m) => m.id === a.value.id)?.objectCount).toBe(5)
  })

  it('does not replace a non-empty world when the user cancels', async () => {
    const saved = saveWorld('Keep')
    if (!saved.ok) throw new Error(saved.error)
    useWorld.getState().removeObject('bld-a')
    const r = await loadSavedWorld(saved.value.id, { confirmReplace: no })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.cancelled).toBe(true)
    expect(useWorld.getState().objects['bld-a']).toBeUndefined()
  })

  it('reports storage errors instead of throwing', () => {
    mem.failWrites = true
    const r = saveWorld('Too big')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/full/)
    ;(globalThis as { localStorage?: unknown }).localStorage = undefined
    expect(saveWorld('No storage').ok).toBe(false)
    expect(listSavedWorlds()).toEqual([])
  })

  it('reports a damaged save instead of loading it', async () => {
    const saved = saveWorld('Will break')
    if (!saved.ok) throw new Error(saved.error)
    mem.setItem(`realmforge.world.v1.${saved.value.id}`, '{"format":"realmforge-world","version":1,"objects":[{"kind":"wall"}]}')
    const r = await loadSavedWorld(saved.value.id, { confirmReplace: yes })
    expect(r.ok).toBe(false)
  })
})

describe('export / import', () => {
  it('exports portable JSON and imports it back', async () => {
    const { json, filename } = exportWorld('Export Me!')
    expect(filename).toBe('export-me.realmforge.json')
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    const r = await importWorld(json)
    expect(r.ok).toBe(true)
    expect(Object.keys(useWorld.getState().objects).sort()).toEqual(sample().map((o) => o.id).sort())
    expect(useWorldLibrary.getState().activeName).toBe('Export Me!')
  })

  it('imports from a File/Blob and rejects garbage', async () => {
    const { json } = exportWorld('Blob')
    expect((await importWorld(new Blob([json]), { confirmReplace: yes })).ok).toBe(true)
    const bad = await importWorld(new Blob(['hello']), { confirmReplace: yes })
    expect(bad.ok).toBe(false)
  })

  it('keeps new ids from colliding with imported ones', async () => {
    const objects = [{ id: 'bld-9000', kind: 'building', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0 }]
    const r = await importWorld(JSON.stringify({ format: WORLD_FORMAT, version: 1, name: 'x', objects, robotStart: [0, 5], goal: null }), { confirmReplace: yes })
    expect(r.ok).toBe(true)
    expect(Number(newId('bld').split('-')[1])).toBeGreaterThan(9000)
  })
})

describe('dirty tracking and quickSave', () => {
  it('turns dirty after an edit and clean after save', async () => {
    expect(useWorldLibrary.getState().dirty).toBe(false)
    useWorld.getState().addObject({
      kind: 'crate',
      position: [1, 0, 1],
      size: [1, 1, 1],
      rotationY: 0,
    })
    refreshDirty()
    expect(useWorldLibrary.getState().dirty).toBe(true)
    const r = await quickSave('Quick')
    expect(r.ok).toBe(true)
    expect(useWorldLibrary.getState().dirty).toBe(false)
    expect(useWorldLibrary.getState().activeId).toBeTruthy()
  })

  it('quickSave overwrites the active save only after confirmation', async () => {
    expect((await quickSave('One')).ok).toBe(true)
    const id = useWorldLibrary.getState().activeId!
    useWorld.getState().addObject({
      kind: 'tree',
      position: [2, 0, 2],
      size: [1, 2, 1],
      rotationY: 0,
    })
    const cancelled = await quickSave('One', { confirmOverwrite: no })
    expect(cancelled.ok).toBe(false)
    expect(!cancelled.ok && cancelled.cancelled).toBe(true)
    expect(listSavedWorlds()[0].objectCount).toBe(6)

    expect((await quickSave('One', { confirmOverwrite: yes })).ok).toBe(true)
    expect(useWorldLibrary.getState().activeId).toBe(id)
    expect(listSavedWorlds()).toHaveLength(1)
    expect(listSavedWorlds()[0].objectCount).toBe(7)
  })
})

describe('navigation after loading', () => {
  it('rebuilds the grid, restores robot and goal, replans, and still replans on edits', async () => {
    startNavigation()
    const before = useNav.getState().replanCount
    const { json } = exportWorld('Nav')
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    expect((await importWorld(json, { confirmReplace: yes })).ok).toBe(true)

    const nav = useNav.getState()
    expect(nav.replanCount).toBeGreaterThan(before)
    const g = nav.grid
    // Solid crate and building block; tree and road do not.
    expect(isBlocked(g, ...worldToCell(g, [5, 5]))).toBe(true)
    expect(isBlocked(g, ...worldToCell(g, [2, 3]))).toBe(true)
    expect(isBlocked(g, ...worldToCell(g, [-6, 6]))).toBe(false)
    expect(isBlocked(g, ...worldToCell(g, [-3, 0]))).toBe(false)
    expect(nav.status).toBe('moving')
    expect(nav.path[0]).toEqual([-8, 8])
    const end = nav.path.at(-1)!
    expect(Math.hypot(end[0] - 8, end[1] + 8)).toBeLessThan(0.5)

    // Editing the imported world still triggers a replan.
    const count = nav.replanCount
    useWorld.getState().updateObject('wall-a', { position: [0, 0, 0] })
    expect(useNav.getState().replanCount).toBe(count + 1)
  })
})
