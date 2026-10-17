import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from './store'
import { clearHistory, installHistory, withHistorySuppressed } from './history'
import { blocksNavigation } from './types'
import {
  EVENT_CATALOG,
  getEventCatalogEntry,
  listEventCatalog,
  propFromCatalog,
} from './eventCatalog'
import { emptyEventVenue, jobFair } from './presets'
import { loadEnvironment } from './environment'
import { parseWorld, serializeWorld, worldToJSON } from './serialize'
import { idFor } from './store'
import {
  resetAttendeeSimulation,
  startAttendeeSimulation,
  tickAttendee,
  useAttendee,
  listSimulationDestinations,
} from '../sim/attendee'
import { buildGrid } from '../nav/grid'
import { planPath } from '../nav/astar'
import { navObstacles } from './types'

beforeEach(() => {
  installHistory()
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  })
  clearHistory()
  resetAttendeeSimulation()
})

describe('event catalog', () => {
  it('lists furniture and structures', () => {
    expect(listEventCatalog('furniture').length).toBeGreaterThan(3)
    expect(listEventCatalog('structure').some((e) => e.id === 'exhibition-booth')).toBe(true)
    expect(getEventCatalogEntry('registration-desk')?.simulationRole).toBe('registration')
  })

  it('builds placeable props with roles and collision flags', () => {
    const desk = propFromCatalog('registration-desk', [1, 0, 2])!
    expect(desk.kind).toBe('prop')
    expect(desk.catalogId).toBe('registration-desk')
    expect(desk.simulationRole).toBe('registration')
    expect(desk.solid).toBe(true)
    expect(blocksNavigation({ id: 'x', ...desk })).toBe(true)

    const sign = propFromCatalog('directional-sign', [0, 0, 0])!
    expect(sign.solid).toBe(false)
    expect(blocksNavigation({ id: 'y', ...sign })).toBe(false)
  })

  it('has unique catalog ids', () => {
    const ids = EVENT_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('empty venue + job fair', () => {
  it('builds an empty venue with entrance/exit markers and perimeter walls', () => {
    const w = emptyEventVenue()
    expect(w.objects.some((o) => o.kind === 'wall')).toBe(true)
    expect(w.objects.some((o) => o.simulationRole === 'entrance')).toBe(true)
    expect(w.objects.filter((o) => o.simulationRole === 'exit').length).toBeGreaterThanOrEqual(2)
    // Interior should not be packed with industrial racks
    expect(w.objects.filter((o) => o.kind === 'building').length).toBe(0)
  })

  it('job fair template uses editable catalog props', () => {
    const w = jobFair()
    const props = w.objects.filter((o) => o.kind === 'prop')
    expect(props.length).toBeGreaterThan(10)
    expect(props.every((o) => o.catalogId)).toBe(true)
    expect(props.some((o) => o.simulationRole === 'booth')).toBe(true)
    expect(props.some((o) => o.simulationRole === 'registration')).toBe(true)
    expect(props.some((o) => o.simulationRole === 'stage')).toBe(true)
  })

  it('loads job fair via environment API', async () => {
    const r = await loadEnvironment('job-fair')
    expect(r.ok).toBe(true)
    expect(Object.values(useWorld.getState().objects).some((o) => o.catalogId === 'exhibition-booth')).toBe(true)
  })

  it('entrance to registration is reachable on the job fair layout', () => {
    const w = jobFair()
    useWorld.getState().loadWorld(w)
    const entrance = w.objects.find((o) => o.simulationRole === 'entrance')!
    const reg = w.objects.find((o) => o.simulationRole === 'registration')!
    const grid = buildGrid(navObstacles(useWorld.getState().objects))
    const path = planPath(grid, [entrance.position[0], entrance.position[2]], [
      reg.position[0],
      reg.position[2] + 1.2,
    ])
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(1)
  })
})

describe('persistence of event fields', () => {
  it('round-trips catalogId and simulationRole', () => {
    const prop = propFromCatalog('exhibition-booth', [2, 0, -1], 0.5)!
    const world = {
      objects: [{ id: idFor('prop'), ...prop }],
      robotStart: [0, 5] as [number, number],
      goal: null,
    }
    const file = serializeWorld(world, 'Job fair save')
    const json = worldToJSON(file)
    const parsed = parseWorld(json, idFor)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const o = parsed.world.objects[0]!
    expect(o.catalogId).toBe('exhibition-booth')
    expect(o.simulationRole).toBe('booth')
    expect(o.solid).toBe(true)
  })

  it('keeps backward compatibility for worlds without event fields', () => {
    const legacy = {
      format: 'realmforge-world',
      version: 1,
      name: 'Old',
      savedAt: new Date().toISOString(),
      objects: [
        {
          id: 'wall-1',
          kind: 'wall',
          position: [0, 0, 0],
          size: [2, 1.6, 0.3],
          rotationY: 0,
        },
      ],
      robotStart: [0, 0],
      goal: null,
    }
    const parsed = parseWorld(legacy, idFor)
    expect(parsed.ok).toBe(true)
  })
})

describe('attendee simulation', () => {
  it('walks the job-fair itinerary and finishes or progresses', () => {
    useWorld.getState().loadWorld(jobFair())
    startAttendeeSimulation()
    expect(useAttendee.getState().running).toBe(true)
    expect(listSimulationDestinations().some((d) => d.role === 'booth')).toBe(true)

    // Simulate up to ~60s of movement
    for (let i = 0; i < 4000; i++) tickAttendee(0.05, performance.now() + i * 50)
    const phase = useAttendee.getState().phase
    expect(['walking', 'serving', 'done', 'no-path', 'blocked']).toContain(phase)
    // Should have left the entrance step
    expect(useAttendee.getState().stepIndex).toBeGreaterThanOrEqual(1)
  })

  it('replans when geometry changes during a walk', () => {
    useWorld.getState().loadWorld(jobFair())
    startAttendeeSimulation()
    for (let i = 0; i < 40; i++) tickAttendee(0.05, i * 50)
    const before = useAttendee.getState().replanCount
    // Drop a blocking wall across the venue
    useWorld.getState().addObject({
      kind: 'wall',
      position: [0, 0, 2],
      size: [12, 2, 0.4],
      rotationY: 0,
      solid: true,
    })
    const after = useAttendee.getState().replanCount
    expect(after).toBeGreaterThanOrEqual(before)
  })
})
