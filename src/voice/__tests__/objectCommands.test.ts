import { beforeEach, describe, expect, it } from 'vitest'
import { parseVoiceCommand } from '../commandParser'
import { executeVoiceCommand } from '../commandExecutor'
import { useWorld } from '../../world/store'
import { blocksNavigation } from '../../world/types'
import { footprintsOverlap } from '../../world/assets'
import { getLastBatch } from '../../world/spawn'
import { undo, installHistory } from '../../world/history'

const cmd = (text: string) => {
  const r = parseVoiceCommand(text)
  if (!r.ok) throw new Error(`not parsed: ${text}`)
  return r.command
}

describe('object voice commands — parsing', () => {
  it('parses counts, objects and places', () => {
    expect(cmd('Add three trees near the robot')).toMatchObject({ type: 'SPAWN_OBJECTS', count: 3, spec: { kind: 'tree' }, placement: { anchor: 'robot' } })
    expect(cmd('create 5 crates')).toMatchObject({ type: 'SPAWN_OBJECTS', count: 5, spec: { kind: 'crate' } })
    expect(cmd('build two glass towers 20 meters north of the goal')).toMatchObject({
      type: 'SPAWN_OBJECTS',
      count: 2,
      spec: { kind: 'building', style: 'tower' },
      placement: { anchor: 'goal', direction: 'north', distance: 20 },
    })
    expect(cmd('place a brick wall in the center')).toMatchObject({ spec: { kind: 'wall', material: 'brick' }, count: 1, placement: { anchor: 'center' } })
    expect(cmd('put four storage racks')).toMatchObject({ count: 4, spec: { assetId: 'storage-rack' } })
    expect(cmd('add a dozen pine trees')).toMatchObject({ count: 12, spec: { kind: 'tree', style: 'pine' } })
    expect(cmd('Create a building')).toMatchObject({ type: 'SPAWN_OBJECTS', count: 1, spec: { kind: 'building' } })
    expect(cmd('add to houses')).toMatchObject({ count: 2, spec: { style: 'house' } })
    expect(cmd('make a big tall tower')).toMatchObject({ spec: { style: 'tower', scale: 1.5, heightScale: 1.6 } })
    expect(cmd('add a road')).toMatchObject({ spec: { kind: 'platform', material: 'asphalt' } })
    expect(cmd('spawn 100 streetlights')).toMatchObject({ count: 25 })
  })

  it('parses move, rotate, resize and duplicate', () => {
    expect(cmd('move it 10 meters left')).toEqual({ type: 'MOVE_OBJECTS', which: 'selected', direction: 'west', distance: 10 })
    expect(cmd('move them north')).toMatchObject({ type: 'MOVE_OBJECTS', which: 'last', direction: 'north' })
    expect(cmd('move it to the goal')).toMatchObject({ type: 'MOVE_OBJECTS', to: 'goal' })
    expect(cmd('rotate it 45 degrees')).toEqual({ type: 'ROTATE_OBJECTS', which: 'selected', degrees: 45 })
    expect(cmd('turn them right')).toMatchObject({ type: 'ROTATE_OBJECTS', which: 'last', degrees: -90 })
    expect(cmd('make it bigger')).toMatchObject({ type: 'RESIZE_OBJECTS', factor: 1.5, axis: 'all' })
    expect(cmd('make them taller')).toMatchObject({ type: 'RESIZE_OBJECTS', which: 'last', axis: 'height' })
    expect(cmd('make it twice as big')).toMatchObject({ factor: 2 })
    expect(cmd('duplicate it 3 times')).toEqual({ type: 'DUPLICATE_OBJECTS', which: 'selected', count: 3 })
    expect(cmd('add five more trees')).toMatchObject({ type: 'SPAWN_OBJECTS', count: 5 })
  })

  it('leaves tools and world commands alone', () => {
    expect(cmd('select building tool')).toEqual({ type: 'SELECT_TOOL', tool: 'building' })
    expect(cmd('place robot')).toEqual({ type: 'SELECT_TOOL', tool: 'robot' })
    expect(cmd('create a blank world')).toEqual({ type: 'RESET_WORLD' })
    expect(cmd('load mars outpost')).toMatchObject({ type: 'LOAD_ENVIRONMENT' })
  })
})

describe('object voice commands — execution', () => {
  beforeEach(() => {
    installHistory()
    useWorld.getState().loadWorld({ objects: [], robotStart: [-20, 20], goal: [20, -20] })
  })

  it('adds the requested number on free, non-overlapping ground and selects the last', async () => {
    const r = await executeVoiceCommand(cmd('add six crates near the robot'))
    expect(r.status).toBe('executed')
    const objs = Object.values(useWorld.getState().objects)
    expect(objs).toHaveLength(6)
    for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) expect(footprintsOverlap(objs[i], objs[j])).toBe(false)
    // Solid crates never cover the robot's own spot.
    for (const o of objs) expect(Math.hypot(o.position[0] + 20, o.position[2] - 20)).toBeGreaterThan(1)
    expect(useWorld.getState().selectedId).toBe(getLastBatch().at(-1))
    expect(objs.every((o) => blocksNavigation(o))).toBe(true)
  })

  it('one undo removes the whole batch', async () => {
    await executeVoiceCommand(cmd('add four trees'))
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(4)
    expect(undo()).toBe(true)
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
  })

  it('moves, rotates, resizes and copies "it" and "them"', async () => {
    await executeVoiceCommand(cmd('add three houses in the center'))
    const before = getLastBatch().map((id) => [...useWorld.getState().objects[id].position])
    await executeVoiceCommand(cmd('move them 10 meters east'))
    getLastBatch().forEach((id, i) => expect(useWorld.getState().objects[id].position[0]).toBeCloseTo(before[i][0] + 10))

    const sel = useWorld.getState().selectedId!
    await executeVoiceCommand(cmd('rotate it 90 degrees'))
    expect(useWorld.getState().objects[sel].rotationY).toBeCloseTo(Math.PI / 2)
    const h = useWorld.getState().objects[sel].size[1]
    await executeVoiceCommand(cmd('make it taller'))
    expect(useWorld.getState().objects[sel].size[1]).toBeCloseTo(h * 1.5)

    const r = await executeVoiceCommand(cmd('duplicate it 2 times'))
    expect(r.status).toBe('executed')
    expect(Object.keys(useWorld.getState().objects)).toHaveLength(5)
  })

  it('says so when nothing is selected', async () => {
    const r = await executeVoiceCommand(cmd('move it left'))
    expect(r.status).toBe('rejected')
  })
})
