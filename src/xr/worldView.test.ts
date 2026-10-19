import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { useWorld } from '../world/store'
import { useEditor } from '../editor/settings'
import { usePlacement } from './placement'
import { useScan } from '../scan/store'
import { useNav } from '../nav/navState'
import { groundPoint, placement, SCALE_PRESETS, worldPlacement, worldRootRef } from '../scene/worldRoot'
import { switchWorldView, toggleWorldView } from './worldView'

beforeEach(() => {
  useWorld.getState().loadWorld({ objects: [{ id: 'rack-1', kind: 'rack', position: [6, 0, -4], size: [2, 2, 1], rotationY: 0 }], robotStart: [-8, 8], goal: null })
  useWorld.getState().select('rack-1')
  useEditor.getState().set({ worldScale: 'tabletop' })
  usePlacement.getState().resetToDefault()
})
afterEach(() => {
  worldRootRef.current = null
  placement.focus = null
  usePlacement.getState().resetToDefault()
})

describe('tabletop / immersive editing', () => {
  it('enters at the selection, drops AR anchoring and leaves world geometry and route state intact', () => {
    const dropAnchor = vi.fn()
    usePlacement.getState().pinAt([2, 1, -3], [0, 0, 0, 1], 'table', { delete: dropAnchor } as unknown as XRAnchor)
    useScan.setState({ measuring: true, measurePoints: [[1, 0, 1]] })
    const objects = useWorld.getState().objects
    const nav = useNav.getState()
    switchWorldView('life')
    expect(useEditor.getState().worldScale).toBe('life')
    expect(placement.focus).toEqual([6, -4])
    expect(placement.pending).toBe(true)
    expect(usePlacement.getState().status).toBe('free')
    expect(dropAnchor).toHaveBeenCalledOnce()
    expect(useScan.getState()).toMatchObject({ measuring: false, measurePoints: [] })
    expect(useWorld.getState().objects).toBe(objects)
    expect(useWorld.getState().selectedId).toBe('rack-1')
    expect(useNav.getState()).toBe(nav)
  })

  it('edits the same object through transformed controller rays at both scales and retains edits on return', () => {
    const root = new THREE.Group()
    root.rotation.y = 0.7
    root.position.set(2, 1, -3)
    worldRootRef.current = root
    for (const view of ['tabletop', 'life'] as const) {
      switchWorldView(view)
      root.scale.setScalar(SCALE_PRESETS[view].ratio)
      root.updateMatrixWorld(true)
      const local = new THREE.Vector3(view === 'tabletop' ? 3 : 7, 0, -2)
      const target = root.localToWorld(local.clone())
      const ray = new THREE.Ray(target.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0))
      const point = groundPoint({ ray, point: target })!
      expect(point[0]).toBeCloseTo(local.x)
      expect(point[1]).toBeCloseTo(local.z)
      useWorld.getState().updateObject('rack-1', { position: [point[0], 0, point[1]] })
    }
    toggleWorldView()
    expect(useEditor.getState().worldScale).toBe('tabletop')
    expect(useWorld.getState().objects['rack-1'].position[0]).toBeCloseTo(7)
    expect(useWorld.getState().selectedId).toBe('rack-1')
  })

  it('falls back to the robot start without a selection and can repeatedly toggle views', () => {
    useWorld.getState().select(null)
    toggleWorldView()
    expect(placement.focus).toBe(null)
    const head = new THREE.Vector3(1, 1.6, 2)
    const p = worldPlacement('life', head, new THREE.Vector3(0, 0, -1), useWorld.getState().robotStart)
    expect(p.x - 8).toBeCloseTo(head.x)
    expect(p.z + 8).toBeCloseTo(head.z - 1.5)
    toggleWorldView()
    expect(useEditor.getState().worldScale).toBe('tabletop')
    toggleWorldView()
    expect(useEditor.getState().worldScale).toBe('life')
  })
})
