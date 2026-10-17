import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyPull, insideViewFrame, nearestEquivalent, pullStep, rotateAbout, rotateGroup, wrapAngle, yawAligning } from './actions'
import type { V3 } from './handPose'

describe('L gesture: align the world axis', () => {
  it('yaw turns +X to the pointing direction (three.js convention)', () => {
    for (const dir of [[1, 0, 0], [0, 0, -1], [-1, 0, 1], [0.3, -0.8, 0.5]] as V3[]) {
      const yaw = yawAligning(dir)
      const x = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      const flat = new THREE.Vector3(dir[0], 0, dir[2]).normalize()
      expect(x.distanceTo(flat)).toBeLessThan(1e-9)
    }
  })

  it('picks the 90° equivalent closest to the current yaw', () => {
    expect(nearestEquivalent(Math.PI / 2 + 0.1, 0)).toBeCloseTo(0.1)
    expect(nearestEquivalent(-Math.PI + 0.05, 0)).toBeCloseTo(0.05)
  })
})

describe('two-fist pull', () => {
  it('moving both fists 1 m moves the world 1 m (true scale), floor only', () => {
    const step = pullStep([-0.2, 1, -0.3], [0.2, 1, -0.3], [-0.2, 1.4, 0.7], [0.2, 1.4, 0.7])
    expect(step.yaw).toBeCloseTo(0)
    expect(step.move[0]).toBeCloseTo(0)
    expect(step.move[1]).toBeCloseTo(1)
    expect(applyPull([5, 5], 0, step).pos).toEqual([5, 6])
  })

  it('twisting the fists turns the world about their midpoint', () => {
    // Right fist swings from +x to −z around the midpoint: a quarter turn.
    const step = pullStep([-0.2, 1, 0], [0.2, 1, 0], [0, 1, 0.2], [0, 1, -0.2])
    expect(step.yaw).toBeCloseTo(Math.PI / 2)
    // A world point 1 m to the right of the hands ends up 1 m ahead (−z), like the fist did.
    const p = applyPull([1, 0], 0, step).pos
    expect(p[0]).toBeCloseTo(0)
    expect(p[1]).toBeCloseTo(-1)
    // Matches three.js rotation.y.
    const v = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), step.yaw)
    expect(v.x).toBeCloseTo(p[0])
    expect(v.z).toBeCloseTo(p[1])
  })

  it('wraps angles to [−π, π)', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI / 2 - 2 * Math.PI)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('frame hands: what is inside the frame', () => {
  const head: V3 = [0, 1.6, 0]
  // Hands 0.45 m ahead framing a 0.3 m square centred at eye height.
  const a: V3 = [-0.15, 1.45, -0.45]
  const b: V3 = [0.15, 1.75, -0.45]

  it('selects things behind the frame and ignores things outside or behind you', () => {
    expect(insideViewFrame([0, 1.6, -5], head, a, b)).toBe(true) // straight ahead, far away
    expect(insideViewFrame([1.2, 1.6, -5], head, a, b)).toBe(true) // within the widened view cone
    expect(insideViewFrame([3, 1.6, -5], head, a, b)).toBe(false) // outside the frame
    expect(insideViewFrame([0, 1.6, 5], head, a, b)).toBe(false) // behind you
  })
})

describe('rotating a selection', () => {
  it('rotates single objects in place and groups about their centroid', () => {
    expect(rotateAbout([3, 4], [3, 4], 1)).toEqual([3, 4])
    const out = rotateGroup(
      [
        { position: [-1, 0, 0], rotationY: 0 },
        { position: [1, 0, 0], rotationY: 0.5 },
      ],
      Math.PI,
    )
    expect(out[0].position[0]).toBeCloseTo(1)
    expect(out[1].position[0]).toBeCloseTo(-1)
    expect(out[1].rotationY).toBeCloseTo(0.5 + Math.PI)
  })
})
