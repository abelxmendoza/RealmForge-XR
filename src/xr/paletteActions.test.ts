import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorld } from '../world/store'
import { useEnvironment } from '../world/environment'
import { clearHistory, installHistory } from '../world/history'
import { getConfirmation, resetConfirmationChannel, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import * as actions from '../world/actions'
import {
  blankPaletteWorld,
  createPaletteWorld,
  deletePaletteSelection,
  editPaletteSelection,
  loadPaletteEnvironment,
  loadPaletteSave,
  savePaletteWorld,
} from './paletteActions'
import { markClean, saveWorld, useWorldLibrary } from '../world/persistence'

beforeEach(() => {
  resetConfirmationChannel()
  useWorld.getState().loadWorld({ objects: [{ id: 'wall-1', kind: 'wall', position: [0, 0, 0], size: [2, 2, 1], rotationY: 0 }], robotStart: [-8, 8], goal: [8, -8] })
  useWorld.getState().select('wall-1')
  installHistory()
  clearHistory()
})

describe('VR control palette', () => {
  it('loads an environment only after the in-world confirmation accepts', async () => {
    const stop = subscribeConfirmation(() => {})
    const result = loadPaletteEnvironment('mars-outpost')
    expect(useWorld.getState().objects['wall-1']).toBeDefined()
    resolveConfirmation(getConfirmation()!.id, true)
    expect((await result).ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    stop()
  })
  it('keeps the current world when environment selection is cancelled', async () => {
    const stop = subscribeConfirmation(() => {})
    const result = loadPaletteEnvironment('warehouse')
    resolveConfirmation(getConfirmation()!.id, false)
    expect((await result).ok).toBe(false)
    expect(useWorld.getState().objects['wall-1']).toBeDefined()
    stop()
  })
  it('denies blank-world replacement without a confirmation consumer', async () => {
    expect((await blankPaletteWorld()).ok).toBe(false)
    expect(useWorld.getState().objects['wall-1']).toBeDefined()
  })
  it('edits the selected object through the same store and undo history', () => {
    editPaletteSelection('rotate-right')
    expect(useWorld.getState().objects['wall-1'].rotationY).toBeCloseTo(Math.PI / 12)
    editPaletteSelection('grow')
    expect(useWorld.getState().objects['wall-1'].size).toEqual([2.5, 2, 1.5])
    editPaletteSelection('duplicate')
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(2)
  })
  it('deletes the confirmed target rather than a later selection', async () => {
    const second = useWorld.getState().addObject({ kind: 'crate', position: [2, 0, 0], size: [1, 1, 1], rotationY: 0 })
    const stop = subscribeConfirmation(() => {})
    const result = deletePaletteSelection()
    useWorld.getState().select(second)
    resolveConfirmation(getConfirmation()!.id, true)
    await result
    expect(useWorld.getState().objects['wall-1']).toBeUndefined()
    expect(useWorld.getState().objects[second]).toBeDefined()
    stop()
  })
  it('turns unexpected load crashes into ReplaceResult failures', async () => {
    const spy = vi.spyOn(actions.worldActions, 'loadEnvironment').mockRejectedValueOnce(new Error('palette boom'))
    const r = await loadPaletteEnvironment('mars-outpost')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/crashed: palette boom/)
    spy.mockRestore()
  })

  it('turns unexpected save-load crashes into soft failures', async () => {
    const data = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
    })
    useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
    markClean()
    const saved = saveWorld('Palette')
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const loadSpy = vi.spyOn(actions.worldActions, 'loadSavedWorld').mockRejectedValueOnce(new Error('save crash'))
    const loadFail = await loadPaletteSave(saved.value.id)
    expect(loadFail.ok).toBe(false)
    if (!loadFail.ok) expect(loadFail.error).toMatch(/crashed: save crash/)
    loadSpy.mockRestore()

    const saveSpy = vi.spyOn(actions.worldActions, 'quickSave').mockRejectedValueOnce(new Error('qs crash'))
    const saveFail = await savePaletteWorld()
    expect(saveFail.ok).toBe(false)
    if (!saveFail.ok) expect(saveFail.error).toMatch(/crashed: qs crash/)
    saveSpy.mockRestore()
  })

  it('creates a palette world through the guarded path', async () => {
    const data = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
    })
    useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
    markClean()
    const stop = subscribeConfirmation(() => {})
    const pending = createPaletteWorld('blank')
    resolveConfirmation(getConfirmation()!.id, true)
    const r = await pending
    expect(r.ok).toBe(true)
    stop()
  })
})
