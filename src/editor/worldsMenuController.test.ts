import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { useEnvironment } from '../world/environment'
import { markClean, saveWorld, useWorldLibrary } from '../world/persistence'
import {
  isWorldsMenuBusy,
  menuDeleteSavedWorld,
  menuDownloadWorld,
  menuImportWorld,
  menuLoadSavedWorld,
  menuQuickSave,
  menuRenameSavedWorld,
  menuSaveWorld,
  resetWorldsMenuController,
} from './worldsMenuController'
import { WORLD_FORMAT, WORLD_VERSION } from '../world/serialize'

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

beforeEach(() => {
  resetWorldsMenuController()
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

afterEach(() => {
  resetWorldsMenuController()
})

describe('worldsMenuController', () => {
  it('saves and reports ok feedback', async () => {
    const { feedback } = await menuSaveWorld('Demo')
    expect(feedback.kind).toBe('ok')
    if (feedback.kind === 'ok') expect(feedback.message).toMatch(/Saved "Demo"/)
  })

  it('loads with confirm and surfaces cancel', async () => {
    const saved = saveWorld('City')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const cancelled = await menuLoadSavedWorld(saved.value.id, () => false)
    expect(cancelled.feedback.kind).toBe('cancelled')
  })

  it('imports JSON and reports errors for garbage', async () => {
    const bad = await menuImportWorld('{')
    expect(bad.feedback.kind).toBe('error')
    const good = await menuImportWorld(
      JSON.stringify({ format: WORLD_FORMAT, version: WORLD_VERSION, name: 'In', objects: [], robotStart: [0, 0], goal: null }),
    )
    expect(good.feedback.kind).toBe('ok')
  })

  it('blocks overlapping actions', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = menuQuickSave('A', async () => {
      await gate
      return true
    })
    await Promise.resolve()
    // Force busy by starting a hanging save-as path: patch via concurrent menuSave while first holds busy
    // menuQuickSave sets busy immediately; second call should fail.
    expect(isWorldsMenuBusy()).toBe(true)
    const second = await menuSaveWorld('B')
    expect(second.feedback.kind).toBe('error')
    if (second.feedback.kind === 'error') expect(second.feedback.message).toMatch(/already running/)
    release()
    await first
    expect(isWorldsMenuBusy()).toBe(false)
  })

  it('turns thrown overwrite confirms into error feedback', async () => {
    expect((await menuSaveWorld('A')).feedback.kind).toBe('ok')
    const r = await menuQuickSave('A', () => {
      throw new Error('ui broke')
    })
    expect(r.feedback.kind).toBe('error')
    if (r.feedback.kind === 'error') expect(r.feedback.message).toMatch(/ui broke/)
  })

  it('renames, deletes, and exports through menu helpers', async () => {
    const saved = saveWorld('Named')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const renamed = await menuRenameSavedWorld(saved.value.id, 'Renamed')
    expect(renamed.feedback.kind).toBe('ok')
    const exported = await menuDownloadWorld('Renamed')
    expect(exported.result).toHaveProperty('ok')
    const deleted = await menuDeleteSavedWorld(saved.value.id, 'Renamed')
    expect(deleted.feedback.kind).toBe('ok')
  })
})
