import { describe, expect, it } from 'vitest'
import { pulseTargets } from './haptics'

const pad = (handedness: 'left' | 'right', pressed: number[] = [], actuators = 1) => ({
  handedness,
  gamepad: { buttons: [0, 1, 2].map((i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })), hapticActuators: Array(actuators).fill({}) },
})
const hand = { handedness: 'right' as const, hand: {}, gamepad: null }

describe('haptic targets', () => {
  it('"active" buzzes only controllers with trigger or grip held', () => {
    const left = pad('left')
    const right = pad('right', [1])
    expect(pulseTargets([left, right, hand], 'active')).toEqual([right])
  })

  it('never targets hands or controllers without an actuator', () => {
    expect(pulseTargets([hand, pad('left', [], 0)], 'both')).toEqual([])
  })

  it('left / right / both pick by handedness', () => {
    const l = pad('left')
    const r = pad('right')
    expect(pulseTargets([l, r], 'left')).toEqual([l])
    expect(pulseTargets([l, r], 'both')).toEqual([l, r])
  })
})
