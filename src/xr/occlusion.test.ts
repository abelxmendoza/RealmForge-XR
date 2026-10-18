import { describe, expect, it } from 'vitest'
import { blocksView, occlusionSource } from './occlusion'

describe('occlusion source', () => {
  it('is off when the toggle is off, even with depth available', () => {
    expect(occlusionSource({ enabled: false, hasDepth: true, planes: 3, meshes: 2 })).toBe('off')
  })
  it('prefers live depth (Quest 3 / 3S)', () => {
    expect(occlusionSource({ enabled: true, hasDepth: true, planes: 3, meshes: 2 })).toBe('depth')
  })
  it('falls back to the Space Setup room (Quest 2)', () => {
    expect(occlusionSource({ enabled: true, hasDepth: false, planes: 4, meshes: 0 })).toBe('room')
    expect(occlusionSource({ enabled: true, hasDepth: false, planes: 0, meshes: 1 })).toBe('room')
  })
  it('reports none when there is neither', () => {
    expect(occlusionSource({ enabled: true, hasDepth: false, planes: 0, meshes: 0 })).toBe('none')
  })
  it('never uses the floor, ceiling or whole-room mesh as a blocker', () => {
    expect(['floor', 'ceiling', 'global mesh', 'Floor'].map(blocksView)).toEqual([false, false, false, false])
    expect(['wall', 'table', 'couch', undefined].map(blocksView)).toEqual([true, true, true, true])
  })
})
