import { describe, expect, it } from 'vitest'
import { faceYaw } from './PanelMoveBar'

describe('panel facing', () => {
  it('turns the panel front (+z) toward the head', () => {
    expect(faceYaw([0, -1], [0, 0])).toBeCloseTo(0) // head straight ahead of the front
    expect(faceYaw([0, 1], [0, 0])).toBeCloseTo(Math.PI)
    expect(faceYaw([-1, 0], [0, 0])).toBeCloseTo(Math.PI / 2)
    expect(faceYaw([1, 0], [0, 0])).toBeCloseTo(-Math.PI / 2)
  })
})
