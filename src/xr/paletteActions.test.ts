import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { useEnvironment } from '../world/environment'
import { clearHistory, installHistory } from '../world/history'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import { blankPaletteWorld, deletePaletteSelection, editPaletteSelection, loadPaletteEnvironment } from './paletteActions'

beforeEach(() => {
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
})
