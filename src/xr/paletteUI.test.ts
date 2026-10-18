import { describe, expect, it } from 'vitest'
import { shouldSummon } from './paletteUI'

const head = { x: 0, y: 1.6, z: 0 }
const ahead = { x: 0, y: 0, z: -1 } // looking down −z

describe('wrist Menu: bring the palette to you, or close it', () => {
  it('closes it when it is right in front of you', () => {
    expect(shouldSummon({ x: 0, y: 1.5, z: -0.85 }, head, ahead)).toBe(false)
    expect(shouldSummon({ x: -0.5, y: 1.5, z: -1 }, head, ahead)).toBe(false) // a little to the side still counts
  })
  it('brings it to you when it is behind you', () => {
    expect(shouldSummon({ x: 0, y: 1.5, z: 1 }, head, ahead)).toBe(true)
  })
  it('brings it to you when you walked away from it', () => {
    expect(shouldSummon({ x: 0, y: 1.5, z: -3 }, head, ahead)).toBe(true)
  })
})
