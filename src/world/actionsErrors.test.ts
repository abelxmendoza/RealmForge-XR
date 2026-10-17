import { beforeEach, describe, expect, it } from 'vitest'
import { loadEnvironmentAction, loadSavedWorldAction, objectCount, requireReplaceConfirm, worldActions } from './actions'
import { useWorld } from './store'
import { useEnvironment } from './environment'
import { markClean, saveWorld, useWorldLibrary } from './persistence'
import { installHistory, clearHistory, withHistorySuppressed } from './history'

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
  installHistory()
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 5], goal: [0, -5] })
  })
  clearHistory()
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  useEnvironment.getState().setActive(null)
  markClean()
})

describe('worldActions error paths', () => {
  it('loadSavedWorldAction requires confirm on non-empty worlds', async () => {
    const saved = saveWorld('S')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    expect(objectCount()).toBe(1)
    const denied = await loadSavedWorldAction(saved.value.id)
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.cancelled).toBe(true)

    const crashed = await loadSavedWorldAction(saved.value.id, {
      confirmReplace: () => {
        throw new Error('menu dead')
      },
    })
    expect(crashed.ok).toBe(false)
    if (!crashed.ok) expect(crashed.error).toMatch(/Confirmation failed: menu dead/)
  })

  it('normalizeEnvironmentId is exposed on the facade', () => {
    expect(worldActions.normalizeEnvironmentId('mars-outpost')).toBe('mars-outpost')
    expect(worldActions.normalizeEnvironmentId(' warehouse ')).toBe('warehouse')
    expect(worldActions.normalizeEnvironmentId('atlantis')).toBeNull()
  })

  it('loadEnvironmentAction rejects blank ids', async () => {
    const r = await loadEnvironmentAction('  ')
    expect(r.ok).toBe(false)
  })

  it('requireReplaceConfirm skips confirm on empty worlds', async () => {
    let called = false
    const r = await requireReplaceConfirm('Load?', {
      confirmReplace: () => {
        called = true
        return true
      },
    })
    expect(r.ok).toBe(true)
    expect(called).toBe(false)
  })
})
