import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { useEnvironment } from '../world/environment'
import { markClean, saveWorld, useWorldLibrary } from '../world/persistence'
import {
  isLibraryMenuBusy,
  menuCreateWorld,
  menuDeleteWorld,
  menuDuplicateWorld,
  menuLibraryImport,
  menuOpenWorld,
  resetLibraryMenuController,
} from './libraryMenuController'
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
  resetLibraryMenuController()
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

afterEach(() => {
  resetLibraryMenuController()
})

describe('libraryMenuController', () => {
  it('creates a blank world and reports ok feedback', async () => {
    const { feedback } = await menuCreateWorld('Studio', 'blank')
    expect(feedback.kind).toBe('ok')
    if (feedback.kind === 'ok') expect(feedback.message).toMatch(/Created "Studio"/)
    expect(useWorldLibrary.getState().activeName).toBe('Studio')
  })

  it('opens after confirm and surfaces cancel', async () => {
    const saved = saveWorld('City')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const cancelled = await menuOpenWorld(saved.value.id, () => false)
    expect(cancelled.feedback.kind).toBe('cancelled')
  })

  it('duplicates and deletes saved worlds', async () => {
    const saved = saveWorld('Base')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const copy = await menuDuplicateWorld(saved.value.id, 'Base copy')
    expect(copy.feedback.kind).toBe('ok')
    const del = await menuDeleteWorld(saved.value.id, 'Base')
    expect(del.feedback.kind).toBe('ok')
  })

  it('imports JSON and reports errors for garbage', async () => {
    const bad = await menuLibraryImport('{')
    expect(bad.feedback.kind).toBe('error')
    const good = await menuLibraryImport(
      JSON.stringify({ format: WORLD_FORMAT, version: WORLD_VERSION, name: 'In', objects: [], robotStart: [0, 0], goal: null }),
    )
    expect(good.feedback.kind).toBe('ok')
  })

  it('blocks overlapping actions', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = menuCreateWorld('Hang', 'blank', async () => {
      await gate
      return true
    })
    await Promise.resolve()
    expect(isLibraryMenuBusy()).toBe(true)
    const second = await menuCreateWorld('Other', 'blank')
    expect(second.feedback.kind).toBe('error')
    if (second.feedback.kind === 'error') expect(second.feedback.message).toMatch(/already running/)
    release()
    await first
    expect(isLibraryMenuBusy()).toBe(false)
  })

  it('turns thrown create confirms into error feedback', async () => {
    useWorld.getState().addObject({ kind: 'crate', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0, solid: true })
    const r = await menuCreateWorld('Boom', 'blank', () => {
      throw new Error('library ui broke')
    })
    expect(r.feedback.kind).toBe('error')
    if (r.feedback.kind === 'error') expect(r.feedback.message).toMatch(/library ui broke/)
  })
})
