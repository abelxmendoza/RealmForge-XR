import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Line2, LineGeometry, LineMaterial } from 'three-stdlib'
import { installLineRaycastGuard } from './lineRaycastGuard'

/** An XR-style ray: no `camera` on the raycaster (the headset crash when rays were turned on). */
function xrRaycaster() {
  const r = new THREE.Raycaster(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0))
  ;(r as { camera: unknown }).camera = null
  return r
}

function fatLine() {
  const geo = new LineGeometry()
  geo.setPositions([-1, 0, 0, 1, 0, 0])
  return new Line2(geo, new LineMaterial({ linewidth: 3 }))
}

describe('fat line raycast guard', () => {
  it('reproduces the headset error without the guard, and is safe with it', () => {
    const line = fatLine()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => line.raycast(xrRaycaster(), [])).toThrow(/near/)
    installLineRaycastGuard()
    const hits: THREE.Intersection[] = []
    expect(() => line.raycast(xrRaycaster(), hits)).not.toThrow()
    expect(hits).toHaveLength(0)
    errors.mockRestore()
  })
})
