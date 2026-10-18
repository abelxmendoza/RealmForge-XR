import { describe, expect, it } from 'vitest'
import { AR_ATTEMPTS } from './session'
import { isHorizontalPlaneNormal, planePickPriority } from './placement'

describe('AR_ATTEMPTS', () => {
  it('tries depth first, then no-depth, then minimal', () => {
    expect(AR_ATTEMPTS.map((a) => a.name)).toEqual(['full (with depth)', 'no depth', 'minimal'])
  })

  it('keeps depth-sensing out of the middle and minimal attempts', () => {
    const noDepth = AR_ATTEMPTS[1].init.optionalFeatures ?? []
    const minimal = AR_ATTEMPTS[2].init.optionalFeatures ?? []
    expect(noDepth).toContain('plane-detection')
    expect(noDepth).toContain('anchors')
    expect(noDepth).toContain('unbounded')
    expect(noDepth).not.toContain('depth-sensing')
    expect(minimal).toEqual(['local-floor'])
  })

  it('asks for depth only on the first attempt', () => {
    const full = AR_ATTEMPTS[0].init.optionalFeatures ?? []
    expect(full).toContain('depth-sensing')
    expect(full).toContain('unbounded')
    expect(AR_ATTEMPTS[0].init.depthSensing).toBeTruthy()
  })
})

describe('plane pick helpers', () => {
  it('ranks table before floor before other', () => {
    expect(planePickPriority('table')).toBeLessThan(planePickPriority('floor'))
    expect(planePickPriority('floor')).toBeLessThan(planePickPriority('wall'))
  })

  it('detects horizontal normals', () => {
    expect(isHorizontalPlaneNormal(0.95)).toBe(true)
    expect(isHorizontalPlaneNormal(0.2)).toBe(false)
  })
})
