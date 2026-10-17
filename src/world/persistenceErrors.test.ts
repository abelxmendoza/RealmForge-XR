import { beforeEach, describe, expect, it } from 'vitest'
import {
  copySavedWorld,
  deleteSavedWorld,
  downloadWorld,
  importWorld,
  loadSavedWorld,
  markClean,
  quickSave,
  renameSavedWorld,
  replaceWorld,
  saveWorld,
  useWorldLibrary,
} from './persistence'
import { useWorld } from './store'
import { useEnvironment } from './environment'
import { WORLD_FORMAT, WORLD_VERSION } from './serialize'

class MemoryStorage {
  data = new Map<string, string>()
  failWrites = false
  failReads = false
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(k: string) {
    if (this.failReads) throw new Error('read blocked')
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

beforeEach(() => {
  mem = new MemoryStorage()
  ;(globalThis as { localStorage?: unknown }).localStorage = mem
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

describe('persistence confirm hardening', () => {
  it('loadSavedWorld survives thrown confirmReplace', async () => {
    const saved = saveWorld('City')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const r = await loadSavedWorld(saved.value.id, {
      confirmReplace: () => {
        throw new Error('dialog down')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Confirmation failed: dialog down/)
    expect(Object.keys(useWorld.getState().objects).length).toBe(1)
  })

  it('importWorld survives thrown confirm and empty payloads', async () => {
    useWorld.getState().addObject({ kind: 'crate', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0, solid: true })
    const thrown = await importWorld('{"format":"realmforge-world","version":1,"objects":[],"robotStart":[0,0]}', {
      confirmReplace: () => {
        throw new Error('nope')
      },
    })
    expect(thrown.ok).toBe(false)
    if (!thrown.ok) expect(thrown.error).toMatch(/Confirmation failed/)

    expect((await importWorld('   ')).ok).toBe(false)
    expect((await importWorld('not-json')).ok).toBe(false)
  })

  it('replaceWorld rejects invalid snapshots and cancelled confirms', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    expect((await replaceWorld(null as never)).ok).toBe(false)
    const cancelled = await replaceWorld(
      { name: 'X', objects: [], robotStart: [0, 0], goal: null },
      { confirmReplace: () => false },
    )
    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) expect(cancelled.cancelled).toBe(true)
  })

  it('quickSave turns thrown overwrite confirms into failures', async () => {
    const saved = saveWorld('A')
    expect(saved.ok).toBe(true)
    const r = await quickSave('A', {
      confirmOverwrite: () => {
        throw new Error('confirm crashed')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Confirmation failed: confirm crashed/)
  })
})

describe('persistence storage failures', () => {
  it('reports quota errors on save', () => {
    mem.failWrites = true
    const r = saveWorld('Huge')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/storage is full/i)
  })

  it('reports read failures on load', async () => {
    const saved = saveWorld('Ok')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    mem.failReads = true
    const r = await loadSavedWorld(saved.value.id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/storage error/i)
  })

  it('rejects empty load ids', async () => {
    expect((await loadSavedWorld('')).ok).toBe(false)
    expect((await loadSavedWorld('   ')).ok).toBe(false)
  })

  it('survives a corrupt index entry list', () => {
    mem.setItem('realmforge.worlds.v1', '{not-json')
    expect(saveWorld('Still works').ok).toBe(true)
  })
})

describe('import size guard', () => {
  it('rejects oversized blobs', async () => {
    const big = { size: 6 * 1024 * 1024, text: async () => '{"format":"realmforge-world"}' } as Blob
    const r = await importWorld(big)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/too large/)
  })

  it('accepts a minimal valid world string', async () => {
    const json = JSON.stringify({
      format: WORLD_FORMAT,
      version: WORLD_VERSION,
      name: 'Tiny',
      objects: [],
      robotStart: [1, 1],
      goal: null,
    })
    const r = await importWorld(json)
    expect(r.ok).toBe(true)
    expect(useWorldLibrary.getState().activeName).toBe('Tiny')
  })

  it('reports unreadable file sources', async () => {
    const bad = { size: 10, text: async () => { throw new Error('read fail') } } as unknown as Blob
    const r = await importWorld(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Could not read the file: read fail/)
  })
})

describe('copy / rename / delete / download hardening', () => {
  it('copies and rejects missing / empty ids', () => {
    const saved = saveWorld('Original')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const copy = copySavedWorld(saved.value.id, 'Clone')
    expect(copy.ok).toBe(true)
    if (copy.ok) expect(copy.value.name).toBe('Clone')
    expect(copySavedWorld('').ok).toBe(false)
    expect(copySavedWorld('missing-id').ok).toBe(false)
  })

  it('rename survives damaged payloads and missing ids', () => {
    const saved = saveWorld('Named')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    mem.setItem(`realmforge.world.v1.${saved.value.id}`, 'null')
    expect(renameSavedWorld(saved.value.id, 'Nope').ok).toBe(false)
    expect(renameSavedWorld('gone', 'X').ok).toBe(false)
  })

  it('delete clears activeId and rejects empty ids', () => {
    const saved = saveWorld('Doomed')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    useWorldLibrary.setState({ activeId: saved.value.id })
    expect(deleteSavedWorld(saved.value.id).ok).toBe(true)
    expect(useWorldLibrary.getState().activeId).toBeNull()
    expect(deleteSavedWorld('').ok).toBe(false)
  })

  it('downloadWorld returns a Result and never throws without DOM download APIs', () => {
    const r = downloadWorld('Offline')
    // jsdom may or may not provide createObjectURL — either ok or a soft failure is fine.
    expect(r).toHaveProperty('ok')
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })
})
