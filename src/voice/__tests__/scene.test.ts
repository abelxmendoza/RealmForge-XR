import { beforeEach, describe, expect, it } from 'vitest'
import { parseVoiceCommand } from '../commandParser'
import { executeVoiceCommand } from '../commandExecutor'
import { useWorld } from '../../world/store'
import { blocksNavigation, navObstacles, type WorldObject } from '../../world/types'
import { footprintsOverlap } from '../../world/assets'
import { installHistory, undo } from '../../world/history'
import { buildGrid } from '../../nav/grid'
import { planPath } from '../../nav/astar'
import { getActorRuntime, tickActors } from '../../actors/runtime'

const run = async (text: string, confirm?: () => Promise<boolean>) => {
  const r = parseVoiceCommand(text)
  if (!r.ok) throw new Error(`not parsed: ${text}`)
  return executeVoiceCommand(r.command, confirm ? { confirm } : {})
}
const objects = () => Object.values(useWorld.getState().objects)
const actors = () => Object.values(useWorld.getState().actors)
const ofKind = (k: WorldObject['kind'], style?: string) => objects().filter((o) => o.kind === k && (!style || o.style === style))

describe('voice scenes', () => {
  beforeEach(() => {
    installHistory()
    useWorld.getState().loadWorld({ objects: [], actors: [], robotStart: [-30, 30], goal: [30, -30] })
  })

  it('builds the street from one sentence, in one undo step', async () => {
    const r = await run('add 3 lampposts, a road and two houses with a few people walking around')
    expect(r.status).toBe('executed')
    expect('message' in r && r.message).toBe('Added 3 streetlights, a road, 2 houses and 3 people walking around.')
    expect(ofKind('streetlight')).toHaveLength(3)
    expect(ofKind('platform')).toHaveLength(1)
    expect(ofKind('building', 'house')).toHaveLength(2)
    expect(actors()).toHaveLength(3)
    expect(actors().every((a) => a.loop && a.route.length >= 2)).toBe(true)

    // Houses sit either side of the road, not on it, and nothing solid overlaps.
    const road = ofKind('platform')[0]
    const [h1, h2] = ofKind('building')
    for (const h of [h1, h2]) expect(footprintsOverlap(h, road)).toBe(false)
    expect(Math.sign(h1.position[2] - road.position[2])).not.toBe(Math.sign(h2.position[2] - road.position[2]))
    const solids = objects().filter((o) => blocksNavigation(o))
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) expect(footprintsOverlap(solids[i], solids[j])).toBe(false)
    // The robot can still reach its goal.
    expect(planPath(buildGrid(navObstacles(useWorld.getState().objects)), [-30, 30], [30, -30])).not.toBeNull()

    expect(undo()).toBe(true)
    expect(objects()).toHaveLength(0)
    expect(actors()).toHaveLength(0)
  })

  it('keeps people walking after they reach a stop', async () => {
    await run('add a road with two people walking around')
    const a = actors()[0]
    const first = a.route[0]
    const goals = new Set<string>()
    for (let i = 0; i < 600; i++) {
      tickActors(0.1)
      goals.add(String(useWorld.getState().actors[a.id].goal))
    }
    // It reached both ends (the goal changed more than once) and is still on the move.
    expect(goals.size).toBeGreaterThan(1)
    expect(getActorRuntime(a.id)?.status).toBe('moving')
    const after = useWorld.getState().actors[a.id]
    expect(after.route.length).toBe(a.route.length)
    expect(after.route.some((p) => p[0] === first[0] && p[1] === first[1])).toBe(true)
  })

  it('names, restyles and resizes things already made', async () => {
    await run('add a road and three houses')
    await run('make the houses brick')
    expect(ofKind('building').every((h) => h.color === '#b0583f')).toBe(true)
    await run('give the second house a flat roof')
    expect(ofKind('building').map((h) => h.roof)).toEqual(['pitched', 'flat', 'pitched'])
    await run('make the road 30 meters long')
    const road = ofKind('platform')[0]
    expect(Math.max(road.size[0], road.size[2])).toBe(30)
    await run('make the first house a tower')
    expect(ofKind('building')[0]).toMatchObject({ style: 'tower', roof: 'flat' })
  })

  it('lines new things up along an existing road', async () => {
    await run('add a road')
    const road = ofKind('platform')[0]
    await run('add four trees along the road')
    for (const t of ofKind('tree')) expect(Math.abs(t.position[2] - road.position[2])).toBeLessThan(20)
  })

  it('asks before deleting more than three things', async () => {
    await run('add five trees')
    expect((await run('remove the trees', async () => false)).status).toBe('rejected')
    expect(ofKind('tree')).toHaveLength(5)
    expect((await run('remove the trees', async () => true)).status).toBe('executed')
    expect(ofKind('tree')).toHaveLength(0)
  })

  it('builds a recipe and reports it', async () => {
    const r = await run('build a small neighbourhood')
    expect(r.status).toBe('executed')
    expect('message' in r && r.message).toMatch(/^Built a neighbourhood: Added a road, 4 houses/)
    expect(planPath(buildGrid(navObstacles(useWorld.getState().objects)), [-30, 30], [30, -30])).not.toBeNull()
  })

  it('sends people to the goal and stops them', async () => {
    await run('add 2 workers')
    expect((await run('send the workers to the goal')).status).toBe('executed')
    expect(actors().every((a) => a.goal?.[0] === 30)).toBe(true)
    await run('make them stop')
    expect(actors().every((a) => a.goal === null && !a.loop)).toBe(true)
  })
  it('asks, with or without a confirm handler, when a big delete is pending', async () => {
    await run('add five trees')
    const r = await run('remove the trees')
    expect(r.status).toBe('needs_confirmation')
    expect(ofKind('tree')).toHaveLength(5)
  })

  it('asks before a delete that earlier clauses could widen', async () => {
    await run('add 4 houses')
    let asked = 0
    const r = await run('make the houses towers and remove the towers', async () => (asked++, false))
    expect(asked).toBe(1)
    expect(r.status).toBe('rejected')
    expect(ofKind('building', 'house')).toHaveLength(4)
  })

  it('lays out a row when asked', async () => {
    await run('add 5 crates in a row')
    const zs = new Set(ofKind('crate').map((c) => c.position[2]))
    expect(ofKind('crate')).toHaveLength(5)
    expect(zs.size).toBe(1)
  })

  it('"them" means the people just added, not older objects', async () => {
    await run('add 2 trees')
    await run('add 2 workers')
    await run('delete them')
    expect(ofKind('tree')).toHaveLength(2)
    expect(actors()).toHaveLength(0)
  })
  it('reads "a couple of" and "lots of" as counts', () => {
    expect(parseVoiceCommand('add a couple of houses')).toMatchObject({ ok: true, command: { type: 'SPAWN_OBJECTS', count: 2, spec: { kind: 'building' } } })
    expect(parseVoiceCommand('add lots of trees')).toMatchObject({ ok: true, command: { type: 'SPAWN_OBJECTS', spec: { kind: 'tree' } } })
  })

  it('puts things along a named object, not the road', () => {
    const r = parseVoiceCommand('add trees along the wall')
    expect(r.ok && r.command.type === 'SPAWN_OBJECTS' && r.command.alongRoad).toBeFalsy()
    expect(r).toMatchObject({ ok: true, command: { placement: { near: { kind: 'wall' } } } })
  })

  it('picks the specific recipe over the neighbourhood', () => {
    expect(parseVoiceCommand('build a village square')).toMatchObject({ ok: true, command: { type: 'BATCH', summary: 'town square' } })
    expect(parseVoiceCommand('build a residential street')).toMatchObject({ ok: true, command: { type: 'BATCH', summary: 'street' } })
    expect(parseVoiceCommand('build a village')).toMatchObject({ ok: true, command: { type: 'BATCH', summary: 'neighbourhood' } })
  })

  it('"move them" after adding people moves the people', async () => {
    await run('add 2 trees')
    const trees = ofKind('tree').map((t) => [...t.position])
    await run('add 2 workers')
    expect((await run('move them 5 meters north')).status).toBe('executed')
    expect(ofKind('tree').map((t) => [...t.position])).toEqual(trees)
    expect(actors().every((a) => a.goal !== null)).toBe(true)
  })

  it('"make it stop" leaves other people alone when none is selected', async () => {
    await run('add 2 workers walking around')
    useWorld.getState().selectActor(null)
    await run('add a tree')
    const r = await run('make it stop')
    expect(r.status).not.toBe('executed')
    expect(actors().every((a) => a.loop)).toBe(true)
  })
})
