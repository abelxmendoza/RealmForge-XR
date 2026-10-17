import { expect, it } from 'vitest'
import { useWorld, newId } from './store'
import { serializeWorld, parseWorld } from './serialize'
import { clearHistory, installHistory, undo } from './history'
import { startNavigation, useNav } from '../nav/navigation'

it('keeps an empty world empty through save/load and restores robot placement with undo', () => {
  startNavigation()
  installHistory()
  useWorld.getState().loadWorld({ objects: [], actors: [], robotEnabled: false, robotStart: [0, 0], goal: null })
  clearHistory()
  expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
  expect(Object.keys(useWorld.getState().actors)).toHaveLength(0)
  expect(useNav.getState().path).toHaveLength(0)
  const parsed = parseWorld(serializeWorld(useWorld.getState(), 'Empty'), newId)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  useWorld.getState().loadWorld(parsed.world)
  expect(useWorld.getState().robotEnabled).toBe(false)
  clearHistory()
  useWorld.getState().placeRobot([2, 3])
  expect(useWorld.getState().robotEnabled).toBe(true)
  expect(undo()).toBe(true)
  expect(useWorld.getState().robotEnabled).toBe(false)
})
it('preserves the original robot in old saves and populated templates', () => {
  useWorld.getState().loadWorld({ objects: [], robotStart: [1, 2], goal: null })
  expect(useWorld.getState().robotEnabled).toBe(true)
})

it('loads Job Fair and Empty as distinct environments without duplicate Empty templates', async () => {
  const { loadEnvironment } = await import('./environment')
  const { listTemplates } = await import('./library')
  const { readEntry } = await import('../landing/entry')
  await loadEnvironment('job-fair', { confirmReplace: () => true })
  const fair = Object.values(useWorld.getState().objects)
  expect(fair.length).toBeGreaterThan(15)
  expect(fair.filter((o) => o.kind === 'prop' && o.simulationRole === 'booth')).toHaveLength(4)
  await loadEnvironment('empty-event-venue', { confirmReplace: () => true })
  expect(Object.keys(useWorld.getState().objects)).toHaveLength(0)
  expect(Object.keys(useWorld.getState().actors)).toHaveLength(0)
  expect(useWorld.getState().robotEnabled).toBe(false)
  expect(listTemplates().filter((t) => t.name === 'Empty')).toHaveLength(1)
  expect(listTemplates().filter((t) => t.id === 'job-fair')).toHaveLength(1)
  expect(readEntry('?editor=1&world=job-fair').world).toBe('job-fair')
  expect(readEntry('?editor=1&world=empty-event-venue').world).toBe('empty-event-venue')
})
