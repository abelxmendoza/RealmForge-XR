import { describe, expect, it } from 'vitest'
import { headInside } from './Obstacles'

describe('standing inside an object', () => {
  const booth: [number, number, number] = [3, 2.4, 2]
  it('detects your head inside a booth', () => {
    expect(headInside({ x: 0.5, y: 1.6, z: -0.3 }, booth)).toBe(true)
  })
  it('is false beside it or above it (standing on a stage or slab)', () => {
    expect(headInside({ x: 2, y: 1.6, z: 0 }, booth)).toBe(false)
    expect(headInside({ x: 0, y: 1.6, z: 0 }, [6, 0.6, 3.5])).toBe(false)
  })
})
