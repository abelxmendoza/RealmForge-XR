import { describe, expect, it } from 'vitest'
import { CONTROLS, ControllerRecognizer, controllerFeatures, type ControllerSample } from './controllerInput'
import { DWELL } from './recognizer'

const pad = (handedness: 'left' | 'right', o: Partial<ControllerSample> = {}): ControllerSample => ({
  handedness,
  grip: handedness === 'left' ? [-0.2, 1.1, -0.3] : [0.2, 1.1, -0.3],
  up: [0, 1, 0],
  forward: [0, 0, -1],
  rayOrigin: handedness === 'left' ? [-0.2, 1.1, -0.3] : [0.2, 1.1, -0.3],
  rayDir: [0, 0, -1],
  trigger: 0,
  squeeze: 0,
  primary: false,
  stick: [0, 0],
  ...o,
})
const free = { left: false, right: false }
const types = (evs: { type: string }[]) => evs.map((e) => e.type)

describe('controller recognizer', () => {
  it('both grips pull the world; letting go ends it', () => {
    const r = new ControllerRecognizer()
    expect(types(r.update(0, 0.016, pad('left', { squeeze: 1 }), pad('right', { squeeze: 1 }), free, false))).toContain('pull-start')
    expect(types(r.update(0.02, 0.016, pad('left', { squeeze: 1 }), pad('right', { squeeze: 1 }), free, false))).toContain('pull-move')
    expect(types(r.update(0.04, 0.016, pad('left'), pad('right', { squeeze: 1 }), free, false))).toContain('pull-end')
  })

  it('a grip on an object (blocked) never starts a world pull', () => {
    const r = new ControllerRecognizer()
    const evs = r.update(0, 0.016, pad('left', { squeeze: 1 }), pad('right', { squeeze: 1 }), { left: false, right: true }, false)
    expect(types(evs)).not.toContain('pull-start')
  })

  it('both triggers held make a frame after the dwell', () => {
    const r = new ControllerRecognizer()
    const L = pad('left', { trigger: 1 })
    const R = pad('right', { trigger: 1 })
    expect(types(r.update(0, 0.016, L, R, free, false))).toContain('frame-progress')
    expect(types(r.update(DWELL.frame + 0.01, 0.016, L, R, free, false))).toContain('frame')
    // With rays on, the triggers belong to the rays.
    expect(types(new ControllerRecognizer().update(0, 0.016, L, R, free, true))).not.toContain('frame-progress')
  })

  it('holding A sets the primary axis after the dwell', () => {
    const r = new ControllerRecognizer()
    const R = pad('right', { primary: true, rayDir: [1, 0, 0] })
    expect(types(r.update(0, 0.016, null, R, free, false))).not.toContain('l-hold')
    const evs = r.update(DWELL.l + 0.01, 0.016, null, R, free, false)
    const hold = evs.find((e) => e.type === 'l-hold')
    expect(hold && 'f' in hold && hold.f.indexDir).toEqual([1, 0, 0])
  })

  it('right trigger selects at a distance; the stick then rotates the selection in 15° steps', () => {
    const r = new ControllerRecognizer()
    expect(types(r.update(0, 0.016, null, pad('right', { trigger: 1 }), free, false))).toContain('pinch-start')
    const step = r.update(0.02, 0.016, null, pad('right', { trigger: 1, stick: [0.9, 0] }), free, false).find((e) => e.type === 'rotate-step')
    expect(step && 'yaw' in step && step.yaw).toBeCloseTo(-CONTROLS.rotateStep)
    // Holding the stick over doesn't repeat; it has to come back first.
    expect(types(r.update(0.04, 0.016, null, pad('right', { trigger: 1, stick: [0.9, 0] }), free, false))).not.toContain('rotate-step')
    expect(types(r.update(0.06, 0.016, null, pad('right'), free, false))).toContain('pinch-end')
  })

  it('right stick flick snap-turns when nothing is held', () => {
    const r = new ControllerRecognizer()
    const turn = r.update(0, 0.016, null, pad('right', { stick: [-0.95, 0] }), free, false).find((e) => e.type === 'turn')
    expect(turn && 'yaw' in turn && turn.yaw).toBeCloseTo(CONTROLS.snapTurn)
  })

  it('left stick moves you at the walking speed, with a dead zone', () => {
    const r = new ControllerRecognizer()
    const move = r.update(0, 0.5, pad('left', { stick: [0, -1] }), null, free, false).find((e) => e.type === 'move')
    expect(move && 'z' in move && move.z).toBeCloseTo(CONTROLS.moveSpeed * 0.5) // stick forward → move forward
    expect(types(r.update(0.5, 0.5, pad('left', { stick: [0.05, 0.05] }), null, free, false))).not.toContain('move')
  })

  it('controller pose maps onto the gesture features the actions use', () => {
    const f = controllerFeatures(pad('right', { up: [0, 2, 0], rayDir: [0, 0, -3] }))
    expect(f.palmNormal).toEqual([0, 1, 0])
    expect(f.indexDir).toEqual([0, 0, -1])
    expect(f.pinchPoint).toEqual([0.2, 1.1, -0.3])
  })
})
