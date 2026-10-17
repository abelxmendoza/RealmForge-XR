import { beforeEach, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { selectActorKind, placeActor, setActorGoal, updateActor, duplicateActor, removeActor } from './actions'
import { actorsForSave, getActorRuntime, startActors, tickActors } from './runtime'
import { parseWorld, serializeWorld } from '../world/serialize'
import { clearHistory, getHistoryState, installHistory, undo, redo } from '../world/history'
import { newId } from '../world/store'
const parseWorldFile = (text: string) => parseWorld(JSON.parse(text), newId)
import { MAX_ACTORS } from './types'

beforeEach(() => {
  startActors()
  installHistory()
  useWorld.getState().loadWorld({ objects: [], robotStart: [-10, -10], goal: null })
  clearHistory()
})
function add(kind: string, x: number, z: number) {
  selectActorKind(kind)
  const result = placeActor([x, z])
  expect(result.ok).toBe(true)
  if (!result.ok || !result.id) throw Error('placement failed')
  return result.id
}
it('moves three distinct actors independently without modifying authored poses or recording frames', () => {
  const ids = [add('worker', -6, -8), add('courier', 0, -8), add('vehicle', 6, -8)]
  ids.forEach((id, i) => expect(setActorGoal(id, [-6 + i * 6, 8]).ok).toBe(true))
  clearHistory()
  const authored = JSON.stringify(useWorld.getState().actors)
  for (let i = 0; i < 10; i++) tickActors(0.1)
  const distance = ids.map((id) => getActorRuntime(id)!.position[1] + 8)
  expect(distance[0]).toBeGreaterThan(1)
  expect(distance[1]).toBeGreaterThan(distance[0])
  expect(distance[2]).toBeGreaterThan(distance[1])
  expect(JSON.stringify(useWorld.getState().actors)).toBe(authored)
  expect(getHistoryState().undoDepth).toBe(0)
  expect(useWorld.getState().robotStart).toEqual([-10, -10])
  setActorGoal(ids[0], null)
  const stopped = [...getActorRuntime(ids[0])!.position]
  tickActors(0.1)
  expect(getActorRuntime(ids[0])!.position).toEqual(stopped)
  expect(getActorRuntime(ids[1])!.status).toBe('moving')
})
it('saves live poses and custom settings, loads old worlds, and removes deleted runtimes', () => {
  const id = add('worker', -4, -4)
  updateActor(id, { name: 'Maya', color: '#123456', speed: 2 })
  setActorGoal(id, [-4, 8])
  tickActors(0.1)
  const file = serializeWorld({ ...useWorld.getState(), actors: actorsForSave() }, 'Actors')
  const parsed = parseWorldFile(JSON.stringify(file))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  expect(parsed.world.actors?.[0]).toMatchObject({ name: 'Maya', color: '#123456', speed: 2, goal: [-4, 8] })
  expect(parsed.world.actors?.[0].position).toEqual(getActorRuntime(id)!.position)
  useWorld.getState().loadWorld(parsed.world)
  expect(getActorRuntime(id)!.status).toBe('moving')
  removeActor(id)
  expect(getActorRuntime(id)).toBeUndefined()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  expect(Object.keys(useWorld.getState().actors)).toHaveLength(0)
})
it('undoes actor changes and clones independent data', () => {
  const id = add('vehicle', 0, 0)
  clearHistory()
  updateActor(id, { name: 'Cargo one' })
  expect(undo()).toBe(true)
  expect(useWorld.getState().actors[id].name).toBe('Utility vehicle')
  expect(redo()).toBe(true)
  const result = duplicateActor(id)
  expect(result.ok).toBe(true)
  if (!result.ok || !result.id) return
  expect(useWorld.getState().actors[result.id].size).not.toBe(useWorld.getState().actors[id].size)
  expect(useWorld.getState().actors[result.id].name).not.toBe('Cargo one')
})
it('rejects overlaps, invalid settings, blocked goals and oversized files', () => {
  const id = add('worker', 0, 0)
  expect(placeActor([0, 0]).ok).toBe(false)
  expect(updateActor(id, { speed: NaN }).ok).toBe(false)
  expect(setActorGoal(id, [50, 0]).ok).toBe(false)
  expect(useWorld.getState().actors[id].goal).toBeNull()
  const file = serializeWorld(useWorld.getState(), 'Invalid')
  expect(parseWorldFile(JSON.stringify({ ...file, actors: [{ ...file.actors![0], kind: 'unknown' }] })).ok).toBe(false)
  expect(parseWorldFile(JSON.stringify({ ...file, actors: Array(MAX_ACTORS + 1).fill(file.actors![0]) })).ok).toBe(false)
})
