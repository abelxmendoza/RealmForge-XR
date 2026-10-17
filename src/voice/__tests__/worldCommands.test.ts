import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseVoiceCommand } from '../commandParser'
import { executeVoiceCommand } from '../commandExecutor'
import { matchSavedWorld } from '../worldCommands'
import { useWorld } from '../../world/store'
import { useEnvironment } from '../../world/environment'
import { listSavedWorlds, saveWorld, useWorldLibrary } from '../../world/persistence'
import { installAutosave, readAutosave, writeAutosave } from '../../world/autosave'
import { leaveEditor } from '../../editor/leaveEditor'

vi.mock('../../editor/leaveEditor', () => ({
  HOME_HREF: '?',
  leaveEditor: vi.fn(),
}))

class MemoryStorage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  getItem(k: string) { return this.data.get(k) ?? null }
  setItem(k: string, v: string) { this.data.set(k, String(v)) }
  removeItem(k: string) { this.data.delete(k) }
  clear() { this.data.clear() }
}

const cmd = (text: string) => {
  const r = parseVoiceCommand(text)
  if (!r.ok) throw new Error(`not parsed: ${text}`)
  return r.command
}
const yes = async () => true

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  useEnvironment.getState().setActive(null)
})

describe('voice world commands — parsing', () => {
  it('parses go home escape hatch', () => {
    expect(cmd('go home')).toEqual({ type: 'GO_HOME' })
    expect(cmd('go back home')).toEqual({ type: 'GO_HOME' })
    expect(cmd('return to the landing page')).toEqual({ type: 'GO_HOME' })
    expect(cmd('exit the editor')).toEqual({ type: 'GO_HOME' })
    expect(cmd('go home now')).toEqual({ type: 'GO_HOME', force: true })
    expect(cmd('leave now')).toEqual({ type: 'GO_HOME', force: true })
  })

  it('parses new / open / save as / resume', () => {
    expect(cmd('new world')).toEqual({ type: 'NEW_WORLD', template: 'blank' })
    expect(cmd('start a new mars world')).toEqual({ type: 'NEW_WORLD', template: 'mars-outpost' })
    expect(cmd('new warehouse world called harbor town')).toEqual({ type: 'NEW_WORLD', template: 'warehouse', name: 'Harbor Town' })
    expect(cmd('open my world 2')).toEqual({ type: 'OPEN_SAVED_WORLD', query: 'my world 2' })
    expect(cmd('open harbor')).toEqual({ type: 'OPEN_SAVED_WORLD', query: 'harbor' })
    expect(cmd('save as harbor town')).toEqual({ type: 'SAVE_WORLD', name: 'Harbor Town' })
    expect(cmd('save this world as harbor')).toEqual({ type: 'SAVE_WORLD', name: 'Harbor' })
    expect(cmd('resume')).toEqual({ type: 'RESUME_SESSION' })
    expect(cmd('continue where I left off')).toEqual({ type: 'RESUME_SESSION' })
  })

  it('keeps existing world commands', () => {
    expect(cmd('load mars outpost')).toMatchObject({ type: 'LOAD_ENVIRONMENT', environmentId: 'mars-outpost' })
    expect(cmd('create a blank world')).toEqual({ type: 'RESET_WORLD' })
    expect(cmd('save world')).toEqual({ type: 'SAVE_WORLD' })
  })

  it('matches saved worlds by name', () => {
    const w = (name: string) => ({ id: name, name, savedAt: '', objectCount: 0 })
    const list = [w('My world'), w('My world 2'), w('Harbor Town'), w('Mars Base')]
    expect(matchSavedWorld('my world 2', list)?.name).toBe('My world 2')
    expect(matchSavedWorld('harbor', list)?.name).toBe('Harbor Town')
    expect(matchSavedWorld('my mars base', list)?.name).toBe('Mars Base')
    expect(matchSavedWorld('castle', list)).toBeNull()
  })
})

describe('voice world commands — execution', () => {
  it('goes home and can force-skip the dirty confirm', async () => {
    const leave = vi.mocked(leaveEditor)
    leave.mockClear()
    useWorldLibrary.setState({ dirty: true })
    const cancelled = await executeVoiceCommand(cmd('go home'), { confirm: async () => false })
    expect(cancelled.status).toBe('rejected')
    expect(leave).not.toHaveBeenCalled()

    expect((await executeVoiceCommand(cmd('go home now'), { confirm: async () => false })).status).toBe('executed')
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('creates, saves as, and reopens worlds by voice', async () => {
    expect((await executeVoiceCommand(cmd('new mars world called red base'), { confirm: yes })).status).toBe('executed')
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(listSavedWorlds().map((w) => w.name)).toContain('Red Base')

    expect((await executeVoiceCommand(cmd('new world'), { confirm: yes })).status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)

    const r = await executeVoiceCommand(cmd('open red base'), { confirm: yes })
    expect(r.status).toBe('executed')
    expect(useWorldLibrary.getState().activeName).toBe('Red Base')
    expect(Object.keys(useWorld.getState().objects).length).toBeGreaterThan(3)

    expect((await executeVoiceCommand(cmd('open the castle'), { confirm: yes })).status).toBe('rejected')
  })
})

describe('auto-save', () => {
  it('never saves an empty world, and resumes the last session', async () => {
    expect(writeAutosave()).toBe(false)
    useWorld.getState().addObject({ kind: 'wall', position: [1, 0, 1], size: [4, 2, 0.3], rotationY: 0 })
    useWorld.getState().addObject({ kind: 'tree', position: [5, 0, 5], size: [2, 4, 2], rotationY: 0 })
    useWorldLibrary.setState({ activeName: 'Session', dirty: true })
    expect(writeAutosave()).toBe(true)
    expect(readAutosave()).toMatchObject({ name: 'Session', objectCount: 2, unsaved: true })

    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    expect((await executeVoiceCommand(cmd('resume'), { confirm: yes })).status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(2)
    expect(useWorldLibrary.getState()).toMatchObject({ activeName: 'Session', dirty: true })
  })

  it('reconnects to the saved world it came from', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [1, 0, 1], size: [4, 2, 0.3], rotationY: 0 })
    const saved = saveWorld('Linked')
    if (!saved.ok) throw new Error(saved.error)
    writeAutosave()
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    useWorldLibrary.setState({ activeId: null })
    expect((await executeVoiceCommand(cmd('resume'), { confirm: yes })).status).toBe('executed')
    expect(useWorldLibrary.getState().activeId).toBe(saved.value.id)
  })

  it('writes after changes once installed, but ignores the boot world', async () => {
    const stop = installAutosave(5)
    expect(readAutosave()).toBeNull()
    useWorld.getState().addObject({ kind: 'crate', position: [2, 0, 2], size: [1, 1, 1], rotationY: 0 })
    await new Promise((r) => setTimeout(r, 30))
    stop()
    expect(readAutosave()?.objectCount).toBe(1)
  })
})
