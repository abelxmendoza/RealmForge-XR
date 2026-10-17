import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { WORLD } from '../world/types'
import { SCALE_PRESETS, TABLE_HEIGHT, onTable, uiSize, worldPlacement } from './worldRoot'

const head = new THREE.Vector3(1, 1.6, 2)
const forward = new THREE.Vector3(0, -0.3, -1) // looking ahead and slightly down

describe('world scale presets', () => {
  it('tabletop sits on a table, room scale and up on the floor', () => {
    expect(onTable(SCALE_PRESETS.tabletop.ratio)).toBe(true)
    expect(onTable(SCALE_PRESETS.room.ratio)).toBe(false)
    expect(onTable(SCALE_PRESETS.life.ratio)).toBe(false)
  })

  it('places the tabletop board ahead of you at table height, clear of your body', () => {
    const p = worldPlacement('tabletop', head, forward, [0, 0])
    expect(p.y).toBe(TABLE_HEIGHT)
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
