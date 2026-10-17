import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { WORLD } from '../world/types'
import { SCALE_PRESETS, onTable, uiSize, worldPlacement } from './worldRoot'

const head = new THREE.Vector3(1, 1.6, 2)
const forward = new THREE.Vector3(0, -0.3, -1) // looking ahead and slightly down

describe('world scale presets', () => {
  it('only tabletop scale has a board edge', () => {
    expect(onTable(SCALE_PRESETS.tabletop.ratio)).toBe(true)
    expect(onTable(SCALE_PRESETS.room.ratio)).toBe(false)
    expect(onTable(SCALE_PRESETS.life.ratio)).toBe(false)
  })

  it('places the tabletop board on the floor ahead of you, clear of your body', () => {
    const p = worldPlacement('tabletop', head, forward, [0, 0])
    expect(p.y).toBe(0)
    expect(p.x).toBeCloseTo(head.x)
    // Board centre is beyond its own half size, so its near edge is in front of you.
    expect(head.z - p.z).toBeGreaterThan(WORLD.half * SCALE_PRESETS.tabletop.ratio)
  })

  it('at life size puts the anchor (robot start) on the floor 1.5 m ahead of you', () => {
    const anchor: [number, number] = [-24, 22]
    const p = worldPlacement('life', head, forward, anchor)
    expect(p.y).toBe(0)
    // Root position + anchor (ratio 1) is where the anchor lands in the room.
    expect(p.x + anchor[0]).toBeCloseTo(head.x)
    expect(head.z - (p.z + anchor[1])).toBeCloseTo(1.5)
  })

  it('keeps controls a reachable real size from tabletop to life size', () => {
    for (const { ratio } of Object.values(SCALE_PRESETS)) {
      const real = uiSize(ratio) * ratio
      expect(real).toBeGreaterThanOrEqual(0.03)
      expect(real).toBeLessThanOrEqual(0.25)
    }
  })
})

describe('world yaw', () => {
  it('life-size placement keeps the robot start 1.5 m ahead after the world is turned', () => {
    const head = new THREE.Vector3(0, 1.6, 0)
    const forward = new THREE.Vector3(0, 0, -1)
    const anchor: [number, number] = [-24, 22]
    const yaw = 0.7
    const p = worldPlacement('life', head, forward, anchor, yaw)
    // Where the anchor lands in the room = root + rotate(anchor, yaw).
    const landed = new THREE.Vector3(anchor[0], 0, anchor[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(p)
    expect(landed.x).toBeCloseTo(0)
    expect(landed.z).toBeCloseTo(-1.5)
  })
})

describe('the grid starts on the floor', () => {
  it('at every scale', () => {
    const head = new THREE.Vector3(0.5, 1.6, 0)
    const forward = new THREE.Vector3(0, 0, -1)
    for (const id of Object.keys(SCALE_PRESETS) as (keyof typeof SCALE_PRESETS)[]) {
      expect(worldPlacement(id, head, forward, [-24, 22]).y).toBe(0)
    }
  })
})
