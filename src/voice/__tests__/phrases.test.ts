import { describe, expect, it } from 'vitest'
import { parseVoiceCommand } from '../commandParser'
import type { VoiceCommand } from '../types'

const cmd = (text: string): VoiceCommand => {
  const r = parseVoiceCommand(text)
  if (!r.ok) throw new Error(`not parsed: ${text}`)
  return r.command
}
const kinds = (c: VoiceCommand) => (c.type === 'BATCH' ? c.commands : [c]).map((x) => (x.type === 'SPAWN_OBJECTS' ? `${x.count} ${x.label}` : x.type === 'SPAWN_ACTORS' ? `${x.count} ${x.label}${x.behaviour ? ` ${x.behaviour}` : ''}` : x.type))

describe('compound sentences', () => {
  it.each([
    ['add 3 lampposts, a road and two houses with a few people walking around', ['3 streetlight', '1 road', '2 house', '3 person wander']],
    ['add two houses and a tree', ['2 house', '1 tree']],
    ['build two towers, five pine trees and a road', ['2 tower', '5 pine tree', '1 road']],
    ['add a road with cars driving around', ['1 road', '3 vehicle wander']],
    ['add a tree and then make it bigger', ['1 tree', 'RESIZE_OBJECTS']],
    ['add two houses then make them brick', ['2 house', 'EDIT_OBJECTS']],
  ])('%s', (text, expected) => {
    const c = cmd(text)
    expect(c.type).toBe('BATCH')
    expect(kinds(c)).toEqual(expected)
  })

  it('keeps "with …" on the thing it describes', () => {
    const c = cmd('add two brick houses with pitched roofs and a road')
    expect(kinds(c)).toEqual(['2 house', '1 road'])
    expect(c.type === 'BATCH' && c.commands[0]).toMatchObject({ spec: { style: 'house', roof: 'pitched', color: '#b0583f' } })
  })

  it('names the parts it could not understand', () => {
    const c = cmd('add a road and a flux capacitor')
    expect(c).toMatchObject({ type: 'BATCH', skipped: ['add a flux capacitor'] })
  })

  it('leaves single commands exactly as before', () => {
    expect(cmd('add three trees near the robot')).toMatchObject({ type: 'SPAWN_OBJECTS', count: 3 })
    expect(cmd('make it bigger')).toEqual({ type: 'RESIZE_OBJECTS', which: 'selected', factor: 1.5, axis: 'all' })
    expect(cmd('undo')).toEqual({ type: 'UNDO' })
  })
})

describe('placing relative to things', () => {
  it.each([
    ['add four trees along the road', { alongRoad: true }],
    ['add 5 crates in a row', { placement: { arrange: 'row' } }],
    ['add trees around the robot', { count: 3, placement: { anchor: 'robot', arrange: 'ring' } }],
    ['put a road between the houses and the tower', { placement: { between: [{ style: 'house', plural: true }, { style: 'tower' }] } }],
    ['add a tree near the houses', { placement: { near: { style: 'house' } } }],
    ['add a road near the houses', { label: 'road' }],
  ])('%s', (text, expected) => expect(cmd(text)).toMatchObject({ type: 'SPAWN_OBJECTS', ...expected }))
})

describe('people', () => {
  it.each([
    ['add a few people walking around', { actorKind: 'worker', count: 3, behaviour: 'wander' }],
    ['add two delivery robots near the goal', { actorKind: 'courier', count: 2, placement: { anchor: 'goal' } }],
    ['add 4 workers heading to the goal', { actorKind: 'worker', count: 4, behaviour: 'goal' }],
    ['add a crowd', { count: 8 }],
  ])('%s', (text, expected) => expect(cmd(text)).toMatchObject({ type: 'SPAWN_ACTORS', ...expected }))

  it.each([
    ['have the people walk around', 'wander'],
    ['send the workers to the goal', 'goal'],
    ['make them stop', 'stop'],
    ['make the people faster', 'faster'],
    ['make the cars slower', 'slower'],
  ])('%s', (text, behaviour) => expect(cmd(text)).toMatchObject({ type: 'ACTOR_BEHAVIOUR', behaviour }))
})

describe('naming and shaping things', () => {
  it.each([
    ['make the house brick', { type: 'EDIT_OBJECTS', target: { style: 'house' }, patch: { material: 'brick' } }],
    ['make the houses towers', { type: 'EDIT_OBJECTS', target: { style: 'house', plural: true }, patch: { style: 'tower' } }],
    ['give the houses flat roofs', { type: 'EDIT_OBJECTS', patch: { roof: 'flat' } }],
    ['make the second house blue', { type: 'EDIT_OBJECTS', target: { ordinal: 2 }, patch: { color: '#3f72c8' } }],
    ['paint it red', { type: 'EDIT_OBJECTS', target: { ref: 'it' }, patch: { color: '#c8443a' } }],
    ['make the trees solid', { type: 'EDIT_OBJECTS', target: { kind: 'tree' }, patch: { solid: true } }],
    ['make the road 20 meters long', { type: 'SIZE_OBJECTS', axis: 'length', metres: 20 }],
    ['make the road longer', { type: 'SIZE_OBJECTS', axis: 'length', factor: 1.5 }],
    ['make the road shorter', { type: 'SIZE_OBJECTS', axis: 'length' }],
    ['make the tower 3 times taller', { type: 'SIZE_OBJECTS', axis: 'height', factor: 3 }],
    ['make it 10 meters tall', { type: 'SIZE_OBJECTS', target: { ref: 'it' }, axis: 'height', metres: 10 }],
    ['remove the trees', { type: 'DELETE_OBJECTS', target: { kind: 'tree', plural: true } }],
    ['delete the people', { type: 'DELETE_OBJECTS', target: { actor: 'worker' } }],
    ['get rid of all the crates', { type: 'DELETE_OBJECTS', target: { kind: 'crate', all: true } }],
    ['move the houses 5 meters north', { type: 'MOVE_OBJECTS', direction: 'north', distance: 5, target: { style: 'house' } }],
    ['rotate the houses 45 degrees', { type: 'ROTATE_OBJECTS', degrees: 45, target: { style: 'house' } }],
  ])('%s', (text, expected) => expect(cmd(text)).toMatchObject(expected))
})

describe('whole scenes', () => {
  it.each([
    ['build a small neighbourhood', 'neighbourhood'],
    ['make a busy main street', 'street'],
    ['create a town square', 'town square'],
    ['build a parking lot', 'parking lot'],
    ['create an industrial yard', 'industrial yard'],
  ])('%s', (text, summary) => expect(cmd(text)).toMatchObject({ type: 'BATCH', summary }))

  it('adds extras to a recipe and scales by size words', () => {
    const big = cmd('build a big neighbourhood')
    const small = cmd('build a small neighbourhood')
    const houses = (c: VoiceCommand) => (c.type === 'BATCH' ? c.commands.find((x) => x.type === 'SPAWN_OBJECTS' && x.label === 'house') : null)
    expect((houses(big) as { count: number }).count).toBeGreaterThan((houses(small) as { count: number }).count)
    expect(kinds(cmd('build a town square with a stage')).at(-1)).toBe('1 stage')
  })
})
