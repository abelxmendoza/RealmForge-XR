import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorld } from '../../world/store'
import { clearHistory, installHistory, withHistorySuppressed } from '../../world/history'
import { markClean, useWorldLibrary } from '../../world/persistence'
import { useEnvironment } from '../../world/environment'
import { executeVoiceCommand } from '../commandExecutor'
import { subscribeVoiceEvents } from '../events'
import type { VoiceEvent } from '../types'

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
    useWorld.getState().loadWorld({
      objects: [
        {
          id: 'bld-1',
          kind: 'building',
          position: [0, 0, 0],
          size: [2, 2, 2],
          rotationY: 0,
          color: '#fff',
        },
      ],
      robotStart: [0, 5],
      goal: [4, -4],
    })
  })
  clearHistory()
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  useEnvironment.getState().setActive(null)
  markClean()
})

describe('executeVoiceCommand', () => {
  it('selects tools via worldActions', async () => {
    const r = await executeVoiceCommand({ type: 'SELECT_TOOL', tool: 'wall' })
    expect(r.status).toBe('executed')
    expect(useWorld.getState().tool).toBe('wall')
  })

  it('undo / redo against history', async () => {
    useWorld.getState().setTool('building')
    useWorld.getState().addObject({
      kind: 'wall',
      position: [1, 0, 1],
      size: [2, 1.6, 0.5],
      rotationY: 0,
      color: '#ccc',
    })
    const before = Object.keys(useWorld.getState().objects).length
    const undoR = await executeVoiceCommand({ type: 'UNDO' })
    expect(undoR.status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects).length).toBe(before - 1)
    const redoR = await executeVoiceCommand({ type: 'REDO' })
    expect(redoR.status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects).length).toBe(before)
  })

  it('refuses destructive delete without confirm handler', async () => {
    useWorld.getState().select('bld-1')
    const r = await executeVoiceCommand({ type: 'DELETE_SELECTED' })
    expect(r.status).toBe('needs_confirmation')
    expect(useWorld.getState().objects['bld-1']).toBeTruthy()
  })

  it('deletes selected only after confirmation', async () => {
    useWorld.getState().select('bld-1')
    const r = await executeVoiceCommand(
      { type: 'DELETE_SELECTED' },
      { confirm: async () => true },
    )
    expect(r.status).toBe('executed')
    expect(useWorld.getState().objects['bld-1']).toBeUndefined()
  })

  it('cancels delete when confirm returns false', async () => {
    useWorld.getState().select('bld-1')
    const r = await executeVoiceCommand(
      { type: 'DELETE_SELECTED' },
      { confirm: async () => false },
    )
    expect(r.status).toBe('rejected')
    expect(useWorld.getState().objects['bld-1']).toBeTruthy()
  })

  it('requires confirmation for environment load on non-empty world', async () => {
    const r = await executeVoiceCommand({
      type: 'LOAD_ENVIRONMENT',
      environmentId: 'mars-outpost',
    })
    expect(r.status).toBe('needs_confirmation')
  })

  it('loads environment when confirm accepts', async () => {
    const r = await executeVoiceCommand(
      { type: 'LOAD_ENVIRONMENT', environmentId: 'mars-outpost' },
      { confirm: async () => true },
    )
    expect(r.status).toBe('executed')
  })

  it('clears selection without confirmation', async () => {
    useWorld.getState().select('bld-1')
    const r = await executeVoiceCommand({ type: 'CLEAR_SELECTION' })
    expect(r.status).toBe('executed')
    expect(useWorld.getState().selectedId).toBeNull()
  })

  it('emits voice events for Agent 3', async () => {
    const events: VoiceEvent[] = []
    const unsub = subscribeVoiceEvents((e) => events.push(e))
    await executeVoiceCommand({ type: 'SELECT_TOOL', tool: 'robot' })
    unsub()
    expect(events.some((e) => e.type === 'VOICE_COMMAND_EXECUTED')).toBe(true)
  })

  it('rejects start navigation without a goal', async () => {
    useWorld.getState().setGoal(null)
    const r = await executeVoiceCommand({ type: 'START_NAVIGATION' })
    expect(r.status).toBe('rejected')
  })

  it('reset world requires confirmation and then blanks', async () => {
    const denied = await executeVoiceCommand({ type: 'RESET_WORLD' })
    expect(denied.status).toBe('needs_confirmation')
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(0)

    const ok = await executeVoiceCommand({ type: 'RESET_WORLD' }, { confirm: async () => true })
    expect(ok.status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects).length).toBe(0)
  })
})

describe('confirmation events', () => {
  it('emits VOICE_CONFIRMATION_REQUIRED', async () => {
    const spy = vi.fn()
    const unsub = subscribeVoiceEvents(spy)
    useWorld.getState().select('bld-1')
    await executeVoiceCommand({ type: 'DELETE_SELECTED' })
    unsub()
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VOICE_CONFIRMATION_REQUIRED' }),
    )
  })
})
