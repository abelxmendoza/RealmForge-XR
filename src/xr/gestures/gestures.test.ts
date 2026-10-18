import { describe, expect, it } from 'vitest'
import { handFeatures, isFist, isL, rollAngle, type HandFeatures, type V3 } from './handPose'
import { GestureRecognizer, isFramePair, DWELL, type GestureEvent } from './recognizer'
import { framePair, makeHand, type TestHand } from './testHands'

const feat = (h: TestHand) => handFeatures(makeHand(h), h.handedness)!
const types = (evs: GestureEvent[]) => evs.map((e) => e.type)

describe('hand poses', () => {
  it('classifies open, fist, pinch and L for both hands', () => {
    for (const handedness of ['left', 'right'] as const) {
      const open = feat({ handedness, pose: 'open' })
      expect(isL(open)).toBe(false)
      expect(isFist(open)).toBe(false)
      expect(isFist(feat({ handedness, pose: 'fist' }))).toBe(true)
      expect(feat({ handedness, pose: 'pinch' }).pinchDistance).toBeLessThan(0.02)
      expect(isL(feat({ handedness, pose: 'L' }))).toBe(true)
    }
  })

  it('only a roughly right-angled thumb and index make an L', () => {
    expect(isL(feat({ handedness: 'right', pose: 'L', lAngle: 90 }))).toBe(true)
    expect(isL(feat({ handedness: 'right', pose: 'L', lAngle: 70 }))).toBe(true)
    expect(isL(feat({ handedness: 'right', pose: 'L', lAngle: 30 }))).toBe(false)
  })

  it('palm normal points out of the palm for both hands', () => {
    // Palm down (back of hand up): the palm normal points down.
    expect(feat({ handedness: 'right', pose: 'open', up: [0, 1, 0] }).palmNormal[1]).toBeLessThan(-0.9)
    expect(feat({ handedness: 'left', pose: 'open', up: [0, 1, 0] }).palmNormal[1]).toBeLessThan(-0.9)
  })

  it('measures wrist roll about the forward axis', () => {
    const axis: V3 = [0, 0, -1]
    const a = feat({ handedness: 'right', pose: 'pinch', forward: axis, up: [0, 1, 0] })
    const b = feat({ handedness: 'right', pose: 'pinch', forward: axis, up: [Math.sin(0.5), Math.cos(0.5), 0] })
    expect(Math.abs(rollAngle(a.palmNormal, b.palmNormal, a.forward))).toBeCloseTo(0.5, 2)
    expect(rollAngle(a.palmNormal, a.palmNormal, a.forward)).toBeCloseTo(0)
  })

  it('returns null when tracking dropped joints', () => {
    const j = makeHand({ handedness: 'right', pose: 'open' })
    delete j['index-finger-tip']
    expect(handFeatures(j, 'right')).toBeNull()
  })
})

describe('gesture recognizer', () => {
  it('pinch starts, moves and ends with hysteresis', () => {
    const g = new GestureRecognizer()
    const pinch = feat({ handedness: 'right', pose: 'pinch' })
    const open = feat({ handedness: 'right', pose: 'open' })
    expect(types(g.update(0, null, pinch))).toContain('pinch-start')
    expect(types(g.update(0.02, null, pinch))).toContain('pinch-move')
    // Slightly open (between start and end thresholds): still pinching.
    const loose: HandFeatures = { ...pinch, pinchDistance: 0.028 }
    expect(types(g.update(0.04, null, loose))).toContain('pinch-move')
    expect(types(g.update(0.06, null, open))).toContain('pinch-end')
  })

  it('L must be held for the dwell before it acts, and fires once', () => {
    const g = new GestureRecognizer()
    const L = feat({ handedness: 'right', pose: 'L' })
    expect(types(g.update(0, null, L))).not.toContain('l-hold')
    expect(types(g.update(DWELL.l * 0.5, null, L))).not.toContain('l-hold')
    expect(types(g.update(DWELL.l + 0.01, null, L))).toContain('l-hold')
    expect(types(g.update(DWELL.l + 0.2, null, L))).not.toContain('l-hold')
  })

  it('two mirrored L hands make a frame and select after the dwell', () => {
    const { left, right } = framePair()
    const l = handFeatures(left, 'left')!
    const r = handFeatures(right, 'right')!
    expect(isFramePair(l, r)).toBe(true)
    const g = new GestureRecognizer()
    const first = g.update(0, l, r)
    expect(types(first)).toContain('frame-progress')
    expect(types(first)).not.toContain('l-hold')
    expect(types(g.update(DWELL.frame + 0.01, l, r))).toContain('frame')
    // A frame never also counts as an L-hold, however long it's held.
    expect(types(g.update(DWELL.l + 1, l, r))).not.toContain('l-hold')
  })

  it('both fists pull the world and win over everything else', () => {
    const g = new GestureRecognizer()
    const lf = feat({ handedness: 'left', pose: 'fist', wrist: [-0.2, 1.1, -0.3] })
    const rf = feat({ handedness: 'right', pose: 'fist', wrist: [0.2, 1.1, -0.3] })
    expect(types(g.update(0, lf, rf))).toContain('pull-start')
    expect(types(g.update(0.02, lf, rf))).toContain('pull-move')
    expect(types(g.update(0.04, lf, feat({ handedness: 'right', pose: 'open' })))).toContain('pull-end')
  })

  it('a blocked hand (touching an object or the wrist menu) starts nothing', () => {
    const g = new GestureRecognizer()
    const pinch = feat({ handedness: 'right', pose: 'pinch' })
    expect(types(g.update(0, null, pinch, { left: false, right: true }))).not.toContain('pinch-start')
  })
})
