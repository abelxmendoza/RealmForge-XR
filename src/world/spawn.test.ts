import { beforeEach, describe, expect, it } from 'vitest'
import { installHistory } from './history'
import { objectFor, spawnObjects } from './spawn'
import { useWorld } from './store'

describe('spawnObjects', () => {
  beforeEach(() => {
    installHistory()
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: [10, 10] })
  })

  it('builds event props from catalogId', () => {
    const o = objectFor({ kind: 'prop', catalogId: 'exhibition-booth' }, [2, 3])
    expect(o).toMatchObject({ kind: 'prop', catalogId: 'exhibition-booth', position: [2, 0, 3] })
    expect(o?.size[0]).toBeGreaterThan(0)
  })

  it('refuses props without a catalog id', () => {
    expect(objectFor({ kind: 'prop' }, [0, 0])).toBeNull()
    expect(spawnObjects({ kind: 'prop' }, 3).ids).toEqual([])
  })

  it('spawns multiple booths on free ground', () => {
    const { ids, requested } = spawnObjects({ kind: 'prop', catalogId: 'exhibition-booth' }, 3)
    expect(requested).toBe(3)
    expect(ids).toHaveLength(3)
    const objs = ids.map((id) => useWorld.getState().objects[id])
    expect(objs.every((o) => o?.kind === 'prop' && o.catalogId === 'exhibition-booth')).toBe(true)
  })
})
