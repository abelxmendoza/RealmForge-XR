import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from './store'
import { clearHistory, installHistory, withHistorySuppressed } from './history'
import { factoryFloor, jobFair, musicFestival, type TemplateSnapshot } from './presets'
import { ENVIRONMENT_IDS, loadEnvironment } from './environment'
import { ENVIRONMENT_IDS_FOR_FILES, parseWorld } from './serialize'
import { currentWorldFile } from './persistence'
import { newId } from './store'
import { getEventCatalogEntry, listEventCatalog } from './eventCatalog'
import { useFlow } from '../flow/store'
import { buildItinerary, resetAttendeeSimulation, startAttendeeSimulation, tickAttendee, useAttendee, getAttendeeRuntime } from '../sim/attendee'
import { pointInZone } from '../flow/validate'

beforeEach(() => {
  installHistory()
  withHistorySuppressed(() => useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null }))
  clearHistory()
  useFlow.getState().clear()
  resetAttendeeSimulation()
})

/** Run the attendee until they finish (or give up) and record every position they stood on. */
function walk(t: TemplateSnapshot) {
  useWorld.getState().loadWorld(t)
  useFlow.getState().replaceAll([], t.flow?.trafficZones ?? [])
  startAttendeeSimulation()
  const visited: string[] = []
  const trail: [number, number][] = []
  let now = 0
  for (let i = 0; i < 12000 && useAttendee.getState().phase !== 'done'; i++) {
    now += 50
    tickAttendee(0.05, now)
    const s = useAttendee.getState()
    if (s.phase === 'serving' && s.destinationId && visited.at(-1) !== s.destinationId) visited.push(s.destinationId)
    if (s.phase === 'no-path' || s.phase === 'blocked') break
    trail.push([...getAttendeeRuntime().pos])
  }
  const roles = visited.map((id) => useWorld.getState().objects[id]?.simulationRole)
  return { phase: useAttendee.getState().phase, task: useAttendee.getState().task, roles, trail }
}

describe('factory and festival templates', () => {
  it('every template id can be saved to a world file', () => {
    expect([...ENVIRONMENT_IDS].sort()).toEqual([...ENVIRONMENT_IDS_FOR_FILES].sort())
  })

  it('adds Industrial and Festival props with real roles', () => {
    expect(listEventCatalog('industrial').map((e) => e.id)).toContain('cnc-machine')
    expect(listEventCatalog('festival').map((e) => e.id)).toContain('main-stage')
    expect(getEventCatalogEntry('security-gate')?.simulationRole).toBe('registration')
    expect(getEventCatalogEntry('food-stall')?.simulationRole).toBe('booth')
  })

  it('itinerary only includes roles the world has', () => {
    const roles = (t: TemplateSnapshot) => buildItinerary(t.objects)
    expect(roles(jobFair())).toEqual(['entrance', 'registration', 'booth', 'booth', 'stage', 'exit'])
    expect(roles(factoryFloor())).toEqual(['entrance', 'registration', 'service', 'exit'])
    expect(roles(musicFestival())).toEqual(['entrance', 'registration', 'booth', 'booth', 'stage', 'service', 'exit'])
  })

  it('a shift worker badges in, works a station and leaves', () => {
    const r = walk(factoryFloor())
    expect(r.phase, r.task).toBe('done')
    expect(r.roles).toEqual(['registration', 'service', 'exit'])
  })

  it('a festival-goer clears security, eats, watches the show, gets a drink and leaves — never backstage', () => {
    const t = musicFestival()
    const r = walk(t)
    expect(r.phase, r.task).toBe('done')
    expect(r.roles).toEqual(['registration', 'booth', 'booth', 'stage', 'service', 'exit'])
    const backstage = t.flow!.trafficZones.find((z) => z.type === 'no-go')!
    expect(r.trail.some((p) => pointInZone(p, backstage))).toBe(false)
  })

  it('loads with its traffic zones and keeps them through a save', async () => {
    const res = await loadEnvironment('factory-floor', { confirmReplace: () => true })
    expect(res.ok).toBe(true)
    const zones = Object.values(useFlow.getState().trafficZones)
    expect(zones.map((z) => z.type)).toEqual(expect.arrayContaining(['one-way', 'no-go', 'slow', 'queue']))
    const parsed = parseWorld(JSON.parse(JSON.stringify(currentWorldFile('Plant 1'))), (kind) => newId(kind))
    expect(parsed.ok && parsed.world.environmentId).toBe('factory-floor')
    expect(parsed.ok && parsed.world.flow?.trafficZones.length).toBe(zones.length)
  })

  it('the factory AGV has a route from the racks to the line', async () => {
    await loadEnvironment('factory-floor', { confirmReplace: () => true })
    expect(useWorld.getState().robotEnabled).toBe(true)
    expect(useWorld.getState().goal).toEqual([-16, -3])
  })
})
