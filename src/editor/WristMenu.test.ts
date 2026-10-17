import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pokeStep } from './WristMenu'

const W = 0.077 // a half-width wrist button
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

describe('wrist menu fingertip presses', () => {
  it('presses once when the fingertip reaches the button face', () => {
    expect(pokeStep(at(0, 0, 0.05), W, false)).toEqual({ down: false, pressed: false }) // hovering 5 cm away
    expect(pokeStep(at(0, 0, 0.008), W, false)).toEqual({ down: true, pressed: true }) // touching
    expect(pokeStep(at(0, 0, -0.01), W, true)).toEqual({ down: true, pressed: false }) // pushed in: no repeat
  })

  it('needs the finger to back off before pressing again (hysteresis)', () => {
    expect(pokeStep(at(0, 0, 0.015), W, true)).toEqual({ down: true, pressed: false }) // still inside release zone
    expect(pokeStep(at(0, 0, 0.03), W, true)).toEqual({ down: false, pressed: false }) // backed off
    expect(pokeStep(at(0, 0, 0.006), W, false).pressed).toBe(true) // second press
  })

  it('ignores touches outside the button outline or far behind it', () => {
    expect(pokeStep(at(W / 2 + 0.01, 0, 0), W, false).pressed).toBe(false)
    expect(pokeStep(at(0, 0.03, 0), W, false).pressed).toBe(false)
    expect(pokeStep(at(0, 0, -0.06), W, false).pressed).toBe(false)
  })
})
