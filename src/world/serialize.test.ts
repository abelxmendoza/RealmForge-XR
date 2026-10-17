import { describe, expect, it } from 'vitest'
import { LIMITS, WORLD_FORMAT, WORLD_VERSION, cleanName, parseWorld, serializeWorld, worldToJSON } from './serialize'
import { idFor } from './store'

describe('cleanName', () => {
  it('trims, truncates, and falls back', () => {
    expect(cleanName('  Hello  ')).toBe('Hello')
    expect(cleanName('x'.repeat(200)).length).toBe(LIMITS.maxNameLength)
    expect(cleanName('', 'Fallback')).toBe('Fallback')
    expect(cleanName(null)).toBe('Untitled world')
    expect(cleanName(12)).toBe('Untitled world')
  })
})

describe('parseWorld hard failures', () => {
  it('rejects non-JSON and wrong envelopes', () => {
    expect(parseWorld('{', idFor).ok).toBe(false)
    expect(parseWorld(null, idFor).ok).toBe(false)
    expect(parseWorld({ format: 'other', version: 1, objects: [], robotStart: [0, 0] }, idFor).ok).toBe(false)
    expect(parseWorld({ format: WORLD_FORMAT, version: 99, objects: [], robotStart: [0, 0] }, idFor).ok).toBe(false)
    expect(parseWorld({ format: WORLD_FORMAT, version: WORLD_VERSION, objects: 'nope', robotStart: [0, 0] }, idFor).ok).toBe(false)
  })

  it('rejects missing robotStart / bad goal / oversize object lists', () => {
    expect(parseWorld({ format: WORLD_FORMAT, version: WORLD_VERSION, objects: [], robotStart: [0] }, idFor).ok).toBe(false)
    expect(parseWorld({ format: WORLD_FORMAT, version: WORLD_VERSION, objects: [], robotStart: [0, 0], goal: 'x' }, idFor).ok).toBe(false)
    const tooMany = Array.from({ length: LIMITS.maxObjects + 1 }, (_, i) => ({
      id: `o${i}`,
      kind: 'crate',
      position: [0, 0, 0],
      size: [1, 1, 1],
      rotationY: 0,
    }))
    expect(parseWorld({ format: WORLD_FORMAT, version: WORLD_VERSION, objects: tooMany, robotStart: [0, 0] }, idFor).ok).toBe(false)
  })

  it('rejects objects with unknown kinds or non-positive sizes', () => {
    const base = { format: WORLD_FORMAT, version: WORLD_VERSION, robotStart: [0, 0], objects: [] as unknown[] }
    expect(
      parseWorld({ ...base, objects: [{ id: 'a', kind: 'spaceship', position: [0, 0, 0], size: [1, 1, 1], rotationY: 0 }] }, idFor).ok,
    ).toBe(false)
    expect(
      parseWorld({ ...base, objects: [{ id: 'a', kind: 'wall', position: [0, 0, 0], size: [0, 1, 1], rotationY: 0 }] }, idFor).ok,
    ).toBe(false)
  })

  it('preserves environmentId only when known', () => {
    const ok = parseWorld(
      {
        format: WORLD_FORMAT,
        version: WORLD_VERSION,
        name: 'E',
        robotStart: [1, 2],
        goal: null,
        environmentId: 'mars-outpost',
        objects: [],
      },
      idFor,
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.world.environmentId).toBe('mars-outpost')

    const bad = parseWorld(
      {
        format: WORLD_FORMAT,
        version: WORLD_VERSION,
        robotStart: [0, 0],
        environmentId: 'atlantis',
        objects: [],
      },
      idFor,
    )
    expect(bad.ok).toBe(true)
    if (bad.ok) expect(bad.world.environmentId).toBeUndefined()
  })
})

describe('serializeWorld', () => {
  it('round-trips through worldToJSON', () => {
    const file = serializeWorld(
      {
        objects: [{ id: 'wall-1', kind: 'wall', position: [1, 0, 2], size: [2, 1, 0.3], rotationY: 0.1, material: 'brick' }],
        robotStart: [3, 4],
        goal: [5, 6],
      },
      'Demo',
    )
    const parsed = parseWorld(worldToJSON(file), idFor)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world.name).toBe('Demo')
    expect(parsed.world.objects[0].material).toBe('brick')
    expect(parsed.world.robotStart).toEqual([3, 4])
    expect(parsed.world.goal).toEqual([5, 6])
  })
})
