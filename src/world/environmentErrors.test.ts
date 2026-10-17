import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENVIRONMENTS,
  loadEnvironment,
  normalizeEnvironmentId,
  useEnvironment,
} from './environment'
import { useWorld } from './store'
import { requireReplaceConfirm } from './actions'
import { markClean, useWorldLibrary } from './persistence'

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
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

describe('normalizeEnvironmentId', () => {
  it('trims and rejects junk', () => {
    expect(normalizeEnvironmentId(' mars-outpost ')).toBe('mars-outpost')
    expect(normalizeEnvironmentId('')).toBeNull()
    expect(normalizeEnvironmentId('   ')).toBeNull()
    expect(normalizeEnvironmentId(null)).toBeNull()
    expect(normalizeEnvironmentId(12)).toBeNull()
    expect(normalizeEnvironmentId('atlantis')).toBeNull()
  })
})

describe('loadEnvironment error handling', () => {
  it('rejects empty and unknown ids with clear errors', async () => {
    const empty = await loadEnvironment('')
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.error).toMatch(/empty id|Unknown/)
    expect((await loadEnvironment('   ')).ok).toBe(false)
    const unknown = await loadEnvironment('nope')
    expect(unknown.ok).toBe(false)
    if (!unknown.ok) expect(unknown.error).toBe('Unknown environment: nope')
  })

  it('survives confirmReplace throwing', async () => {
    useWorld.getState().addObject({ kind: 'crate', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0, solid: true })
    const before = useWorld.getState().objects
    const r = await loadEnvironment('warehouse', {
      confirmReplace: () => {
        throw new Error('headset dialog failed')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.cancelled).toBeUndefined()
      expect(r.error).toMatch(/Confirmation failed: headset dialog failed/)
    }
    expect(useWorld.getState().objects).toEqual(before)
    expect(useEnvironment.getState().activeId).toBeNull()
  })

  it('reports buildWorld failures without activating the environment', async () => {
    const original = ENVIRONMENTS['mars-outpost'].buildWorld
    ENVIRONMENTS['mars-outpost'].buildWorld = () => {
      throw new Error('procedural mesh explode')
    }
    try {
      const r = await loadEnvironment('mars-outpost')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/Could not build "Mars Outpost": procedural mesh explode/)
      expect(useEnvironment.getState().activeId).toBeNull()
    } finally {
      ENVIRONMENTS['mars-outpost'].buildWorld = original
    }
  })

  it('rejects invalid snapshots from buildWorld', async () => {
    const original = ENVIRONMENTS['warehouse'].buildWorld
    ENVIRONMENTS['warehouse'].buildWorld = () => ({ objects: null as never, robotStart: [0, 0], goal: null })
    try {
      const r = await loadEnvironment('warehouse')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(/invalid world snapshot/)
    } finally {
      ENVIRONMENTS['warehouse'].buildWorld = original
    }
  })

  it('keeps prior world when replace is cancelled after a successful confirm gate omission path', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [1, 0, 1], size: [2, 1, 0.3], rotationY: 0 })
    const r = await loadEnvironment('forge-district')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBe(true)
    expect(Object.keys(useWorld.getState().objects).length).toBe(1)
  })
})

describe('requireReplaceConfirm hardening', () => {
  it('passes through thrown confirms as failures', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const r = await requireReplaceConfirm('Load save?', {
      confirmReplace: async () => {
        throw new Error('no UI')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Confirmation failed: no UI/)
  })

  it('allows empty worlds without calling confirm', async () => {
    const spy = vi.fn(() => true)
    const r = await requireReplaceConfirm('Load?', { confirmReplace: spy })
    expect(r.ok).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })
})
