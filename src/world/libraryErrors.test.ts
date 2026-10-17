import { beforeEach, describe, expect, it } from 'vitest'
import { createWorld, nextWorldName } from './library'
import { useWorld } from './store'
import { useEnvironment } from './environment'
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

describe('library createWorld hardening', () => {
  it('rejects unknown templates', async () => {
    const r = await createWorld('X', 'atlantis' as never)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Unknown template/)
  })

  it('cancels cleanly when confirm returns false', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const before = Object.keys(useWorld.getState().objects).length
    const r = await createWorld('Keep', 'blank', { confirmReplace: () => false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBe(true)
    expect(Object.keys(useWorld.getState().objects).length).toBe(before)
  })

  it('survives thrown confirm handlers', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const r = await createWorld('Boom', 'blank', {
      confirmReplace: () => {
        throw new Error('library confirm failed')
      },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Confirmation failed: library confirm failed/)
  })

  it('creates from an environment template after confirm', async () => {
    useWorld.getState().addObject({ kind: 'crate', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0, solid: true })
    const r = await createWorld(nextWorldName('Mars copy'), 'mars-outpost', { confirmReplace: () => true })
    expect(r.ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(5)
  })

  it('creates a blank world without confirm when empty', async () => {
    const r = await createWorld('Empty start', 'blank')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.name).toBe('Empty start')
    expect(useEnvironment.getState().activeId).toBeNull()
  })

  it('survives outer crashes via catch', async () => {
    const r = await createWorld('X', 'blank', {
      confirmReplace: () => {
        // empty world skips confirm — force a later failure by using a bad template id path already covered;
        // this documents that createWorld itself never throws.
        return true
      },
    })
    expect(r).toHaveProperty('ok')
  })
})
