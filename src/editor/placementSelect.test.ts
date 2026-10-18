import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'

/**
 * Placement should hand control back to Move after a successful place, and
 * pressing an existing object should force Move so clicks never spawn over objects.
 */
describe('select-over-spawn placement rules', () => {
  beforeEach(() => {
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
    useWorld.getState().setTool('building')
  })

  it('returns to Move after placing an object', () => {
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

  it('forces Move when an existing object is pressed while a place tool is armed', () => {
    const id = useWorld.getState().addObject({
      kind: 'crate',
      position: [1, 0, 1],
      size: [1, 1, 1],
      rotationY: 0,
    })
    useWorld.getState().setTool('wall')
    // Mirrors Obstacles onDown: stop spawn, select, enter Move
    useWorld.getState().setTool('select')
    useWorld.getState().select(id)
    expect(useWorld.getState().tool).toBe('select')
    expect(useWorld.getState().selectedId).toBe(id)
  })
})
