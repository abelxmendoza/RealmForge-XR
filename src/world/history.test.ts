import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from './store'
import { clearHistory, getHistoryState, installHistory, redo, undo, withHistorySuppressed } from './history'
import { markClean, useWorldLibrary } from './persistence'

beforeEach(() => {
  installHistory()
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld({
      objects: [
        { id: 'wall-1', kind: 'wall', position: [0, 0, 0], size: [4, 1.6, 0.5], rotationY: 0 },
      ],
      robotStart: [-5, 5],
      goal: [5, -5],
    })
  })
  clearHistory()
  useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Untitled world', dirty: false })
  markClean()
})

describe('undo / redo', () => {
  it('undoes an object add and redoes it', () => {
    useWorld.getState().addObject({
      id: 'crate-1',
      kind: 'crate',
      position: [1, 0, 1],
      size: [1, 1, 1],
      rotationY: 0,
    })
    expect(useWorld.getState().objects['crate-1']).toBeTruthy()
    expect(getHistoryState().canUndo).toBe(true)

    expect(undo()).toBe(true)
    expect(useWorld.getState().objects['crate-1']).toBeUndefined()
    expect(getHistoryState().canRedo).toBe(true)

    expect(redo()).toBe(true)
    expect(useWorld.getState().objects['crate-1']).toBeTruthy()
  })

  it('coalesces a drag into a single undo step', () => {
    useWorld.getState().setDragging(true)
    useWorld.getState().updateObject('wall-1', { position: [1, 0, 0] })
    useWorld.getState().updateObject('wall-1', { position: [2, 0, 0] })
    useWorld.getState().updateObject('wall-1', { position: [3, 0, 0] })
    useWorld.getState().setDragging(false)

    expect(getHistoryState().undoDepth).toBe(1)
    expect(undo()).toBe(true)
    expect(useWorld.getState().objects['wall-1'].position).toEqual([0, 0, 0])
  })

  it('does not record suppressed loads', () => {
    withHistorySuppressed(() => {
      useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    })
    expect(getHistoryState().canUndo).toBe(false)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
  })
})
