import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { parseWorld, serializeWorld, WORLD_FORMAT, WORLD_VERSION } from '../world/serialize'
import { idFor } from '../world/store'
import { useFlow } from './store'
import {
  addDraftWaypoint,
  beginRouteDraft,
  finishRouteDraft,
  loadFlowSnapshot,
  revalidateAllRoutes,
  assignRouteToRobot,
  addTrafficZone,
  remainingWaypointsFromRobot,
  createAutomaticRoute,
} from './controller'
import { validateRoute, computeTrajectory, buildFlowGrid } from './validate'
import { validatePlacement, suggestNearestValid } from './placement'
import { buildGrid } from '../nav/grid'
import { planPath } from '../nav/astar'
import type { WorldObject } from '../world/types'
import { startNavigation } from '../nav/navigation'
import { parseVoiceCommand } from '../voice/commandParser'
import { executeVoiceCommand } from '../voice/commandExecutor'

const wall = (id: string, x: number, z: number, w: number, d: number): WorldObject => ({
  id,
  kind: 'wall',
  position: [x, 0, z],
  size: [w, 2, d],
  rotationY: 0,
  solid: true,
})

beforeEach(() => {
  useWorld.getState().loadWorld({
    objects: [],
    robotStart: [-10, 0],
    goal: [10, 0],
  })
  loadFlowSnapshot({ routes: [], trafficZones: [] })
  startNavigation()
})

describe('Flow route model', () => {
  it('keeps user waypoints when finishing a draft', () => {
    beginRouteDraft('waypoint', 'Main aisle')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([0, 0])
    addDraftWaypoint([8, 0])
    const route = finishRouteDraft()!
    expect(route.waypoints).toEqual([
      [-8, 0],
      [0, 0],
      [8, 0],
    ])
    expect(route.trajectory.length).toBeGreaterThan(1)
    expect(route.status).toBe('valid')
  })

  it('does not mutate waypoints when an obstacle forces a detour', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    const route = finishRouteDraft()!
    const intent = route.waypoints.map((p) => [...p])

    useWorld.getState().addObject(wall('blocker', 0, 0, 0.5, 12))
    revalidateAllRoutes()

    const updated = useFlow.getState().routes[route.id]
    expect(updated.waypoints).toEqual(intent)
    expect(updated.status).toBe('replanned')
    expect(updated.trajectory.length).toBeGreaterThan(2)
  })

  it('marks a route unreachable when fully sealed', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    const route = finishRouteDraft()!

    // Box around the goal side.
    useWorld.getState().addObject(wall('n', 8, 3, 6, 0.5))
    useWorld.getState().addObject(wall('s', 8, -3, 6, 0.5))
    useWorld.getState().addObject(wall('w', 5, 0, 0.5, 6))
    useWorld.getState().addObject(wall('e', 11, 0, 0.5, 6))
    revalidateAllRoutes()

    const updated = useFlow.getState().routes[route.id]
    expect(updated.waypoints).toHaveLength(2)
    expect(['unreachable', 'blocked']).toContain(updated.status)
  })

  it('restores a valid status when the obstacle moves off the route', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    const route = finishRouteDraft()!
    const id = useWorld.getState().addObject(wall('blocker', 0, 0, 0.5, 12))
    revalidateAllRoutes()
    expect(useFlow.getState().routes[route.id].status).toBe('replanned')

    useWorld.getState().updateObject(id, { position: [0, 0, 20] })
    revalidateAllRoutes()
    expect(useFlow.getState().routes[route.id].status).toBe('valid')
  })
})

describe('Flow validation helpers', () => {
  it('chains A* between waypoints', () => {
    const grid = buildGrid([])
    const traj = computeTrajectory(grid, [
      [-5, 0],
      [0, 5],
      [5, 0],
    ])!
    expect(traj.length).toBeGreaterThan(2)
    expect(planPath(grid, [-5, 0], [5, 0])).toBeTruthy()
  })

  it('applies no-go zones to the flow grid', () => {
    const zones = [
      {
        id: 'z1',
        name: 'blocked',
        type: 'no-go' as const,
        position: [0, 0, 0] as [number, number, number],
        size: [4, 0.1, 4] as [number, number, number],
        rotationY: 0,
      },
    ]
    const grid = buildFlowGrid([], zones)
    const result = validateRoute(
      [
        [-6, 0],
        [6, 0],
      ],
      [],
      zones,
    )
    expect(result.status).toBe('replanned')
    expect(result.trajectory.every((p) => Math.hypot(p[0], p[1]) > 1.5 || Math.abs(p[1]) > 1.5 || Math.abs(p[0]) > 2)).toBeTruthy()
    void grid
  })

  it('remainingWaypointsFromRobot keeps order from the closest point', () => {
    const rest = remainingWaypointsFromRobot(
      [
        [0, 0],
        [5, 0],
        [10, 0],
      ],
      [4.9, 0],
    )
    expect(rest[0][0]).toBeCloseTo(4.9, 1)
    expect(rest.some((p) => p[0] === 10)).toBe(true)
  })
})

describe('Placement validation', () => {
  it('rejects solid overlap and suggests a nearby spot', () => {
    useWorld.getState().addObject(wall('a', 0, 0, 4, 4))
    const probe = {
      kind: 'building' as const,
      position: [0.5, 0, 0.5] as [number, number, number],
      size: [4, 4, 4] as [number, number, number],
      rotationY: 0,
      solid: true,
    }
    const v = validatePlacement(probe)
    expect(v.reject).toBe(true)
    expect(v.issues).toContain('overlap')
    expect(v.suggestion).not.toBeNull()
    const suggested = suggestNearestValid(probe, Object.values(useWorld.getState().objects))
    expect(suggested).not.toBeNull()
  })

  it('warns when placement blocks a planned route', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    finishRouteDraft()
    const probe = {
      kind: 'building' as const,
      position: [0, 0, 0] as [number, number, number],
      size: [2, 3, 8] as [number, number, number],
      rotationY: 0,
      solid: true,
    }
    const v = validatePlacement(probe)
    expect(v.reject).toBe(false)
    expect(v.issues).toContain('blocks-route')
    expect(v.affectedRouteIds.length).toBeGreaterThan(0)
  })

  it('respects rotated obstacle footprints in route impact', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    finishRouteDraft()
    const probe = {
      kind: 'wall' as const,
      position: [0, 0, 0] as [number, number, number],
      size: [10, 2, 0.5] as [number, number, number],
      rotationY: Math.PI / 2,
      solid: true,
    }
    const v = validatePlacement(probe)
    expect(v.issues).toContain('blocks-route')
  })
})

describe('Traffic zones', () => {
  it('no-go zone forces route replan', () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-8, 0])
    addDraftWaypoint([8, 0])
    const route = finishRouteDraft()!
    addTrafficZone('no-go', [0, 0], [6, 0.1, 6])
    revalidateAllRoutes()
    expect(useFlow.getState().routes[route.id].status).toBe('replanned')
  })
})

describe('Persistence', () => {
  it('serializes route intent without treating trajectory as authoritative', () => {
    beginRouteDraft('waypoint', 'Persist me')
    addDraftWaypoint([-5, 0])
    addDraftWaypoint([5, 0])
    const route = finishRouteDraft()!
    addTrafficZone('slow', [0, 5], [3, 0.1, 3])

    const file = serializeWorld(
      {
        objects: [],
        robotStart: [-10, 0],
        goal: [10, 0],
        routes: Object.values(useFlow.getState().routes),
        trafficZones: Object.values(useFlow.getState().trafficZones),
      },
      'Flow world',
    )
    expect(file.format).toBe(WORLD_FORMAT)
    expect(file.version).toBe(WORLD_VERSION)
    expect(file.routes?.[0].waypoints).toEqual(route.waypoints)
    expect(file.routes?.[0].trajectory).toEqual([])

    const parsed = parseWorld(file, idFor)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.world.flow?.routes[0].waypoints).toEqual(route.waypoints)
    expect(parsed.world.flow?.trafficZones.length).toBe(1)

    loadFlowSnapshot(parsed.world.flow)
    const loaded = Object.values(useFlow.getState().routes)[0]
    expect(loaded.waypoints).toEqual(route.waypoints)
    expect(loaded.trajectory.length).toBeGreaterThan(1)
  })
})

describe('Assign + automatic route', () => {
  it('assigns a valid route to the robot', () => {
    const route = createAutomaticRoute([-10, 0], [10, 0], 'Auto')
    const result = assignRouteToRobot(route.id)
    expect(result.ok).toBe(true)
    expect(useFlow.getState().activeRouteId).toBe(route.id)
  })
})

describe('Voice Flow commands', () => {
  it('parses route planning phrases', () => {
    expect(parseVoiceCommand('Create a new route')).toMatchObject({ ok: true, command: { type: 'FLOW_CREATE_ROUTE' } })
    // "add waypoint here" is one command for both route systems: Flow while drafting, else the robot's stops.
    expect(parseVoiceCommand('Add waypoint here')).toMatchObject({ ok: true, command: { type: 'ROUTE_ADD_WAYPOINT', here: true } })
    expect(parseVoiceCommand('Finish route')).toMatchObject({ ok: true, command: { type: 'FLOW_FINISH_ROUTE' } })
    expect(parseVoiceCommand('Recalculate all routes')).toMatchObject({ ok: true, command: { type: 'FLOW_RECALCULATE' } })
    expect(parseVoiceCommand('Show routes')).toMatchObject({ ok: true, command: { type: 'FLOW_SHOW_ROUTES' } })
    expect(parseVoiceCommand('Hide routes')).toMatchObject({ ok: true, command: { type: 'FLOW_HIDE_ROUTES' } })
    expect(parseVoiceCommand('Pause all agents')).toMatchObject({ ok: true, command: { type: 'FLOW_PAUSE' } })
    expect(parseVoiceCommand('Clear the selected route')).toMatchObject({ ok: true, command: { type: 'FLOW_CLEAR_ROUTE' } })
    expect(parseVoiceCommand('route tool')).toMatchObject({ ok: true, command: { type: 'SELECT_TOOL', tool: 'route' } })
  })

  it('"add waypoint here" goes to the Flow draft while one is open', async () => {
    useFlow.getState().setPointerTarget([3, 4])
    await executeVoiceCommand({ type: 'FLOW_CREATE_ROUTE' })
    const r = await executeVoiceCommand({ type: 'ROUTE_ADD_WAYPOINT', here: true })
    expect(r.status).toBe('executed')
    expect(useFlow.getState().draft?.waypoints).toContainEqual([3, 4])
    await executeVoiceCommand({ type: 'FLOW_CANCEL_ROUTE' })
  })

  it('refuses add-waypoint without a pointer target', async () => {
    useFlow.getState().setPointerTarget(null)
    const r = await executeVoiceCommand({ type: 'FLOW_ADD_WAYPOINT' })
    expect(r.status).toBe('rejected')
  })

  it('adds a waypoint at the pointer target', async () => {
    useFlow.getState().setPointerTarget([1, 2])
    await executeVoiceCommand({ type: 'FLOW_CREATE_ROUTE' })
    const r = await executeVoiceCommand({ type: 'FLOW_ADD_WAYPOINT' })
    expect(r.status).toBe('executed')
    expect(useFlow.getState().draft?.waypoints).toEqual([[1, 2]])
  })

  it('requires confirmation before clearing a route', async () => {
    beginRouteDraft('waypoint')
    addDraftWaypoint([-5, 0])
    addDraftWaypoint([5, 0])
    const route = finishRouteDraft()!
    useFlow.getState().selectRoute(route.id)
    const needs = await executeVoiceCommand({ type: 'FLOW_CLEAR_ROUTE' })
    expect(needs.status).toBe('needs_confirmation')
    const ok = await executeVoiceCommand({ type: 'FLOW_CLEAR_ROUTE' }, { confirm: async () => true })
    expect(ok.status).toBe('executed')
    expect(useFlow.getState().routes[route.id]).toBeUndefined()
  })
})
