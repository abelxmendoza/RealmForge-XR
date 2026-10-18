import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'

/**
 * Catalog placement keeps the place tool armed (place several in a row); "Done placing"
 * returns to Select. Pressing an existing object forces Select so clicks never spawn over objects.
 * Move is drag-on-selection, not a separate tool label.
 */
describe('select-over-spawn placement rules', () => {
  beforeEach(() => {
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    useWorld.getState().setTool('building')
  })

  it('can still return to Select explicitly (Done placing)', () => {
    const id = useWorld.getState().addObject({
      kind: 'building',
      position: [0, 0, 0],
      size: [2, 3, 2],
      rotationY: 0,
    })
    // Mirrors Ground.finishPlacement
    useWorld.getState().select(id)
    useWorld.getState().setTool('select')
    expect(useWorld.getState().tool).toBe('select')
    expect(useWorld.getState().selectedId).toBe(id)
  })

  it('forces Select when an existing object is pressed while a place tool is armed', () => {
    const id = useWorld.getState().addObject({
      kind: 'crate',
      position: [1, 0, 1],
      size: [1, 1, 1],
      rotationY: 0,
    })
    useWorld.getState().setTool('wall')
    // Mirrors Obstacles onDown: stop spawn, select, enter Select
    useWorld.getState().setTool('select')
    useWorld.getState().select(id)
    expect(useWorld.getState().tool).toBe('select')
    expect(useWorld.getState().selectedId).toBe(id)
  })
})
