import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { UI_ORDER, UI_RAY_POINTER, liftToUI } from './UILayer'

describe('on-top UI layer', () => {
  it('moves every menu mesh after the depth clear, keeping their relative order', () => {
    const root = new THREE.Group()
    const tile = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
    const label = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial())
    label.renderOrder = 2
    root.add(tile, label)
    liftToUI(root)
    liftToUI(root) // idempotent: re-applied every frame
    expect(tile.renderOrder).toBe(UI_ORDER + 1)
    expect(label.renderOrder).toBe(UI_ORDER + 3)
    expect((tile.material as THREE.Material).transparent).toBe(true)
  })

  it('draws rays and cursors on top of the menus too', () => {
    expect(UI_RAY_POINTER.rayModel.renderOrder).toBeGreaterThan(UI_ORDER)
    expect(UI_RAY_POINTER.cursorModel.renderOrder).toBeGreaterThan(UI_RAY_POINTER.rayModel.renderOrder)
  })
})
