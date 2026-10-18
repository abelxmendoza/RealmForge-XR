import { useWorld } from '../world/store'
import { useNav, robotRuntime, startNavigation } from '../nav/navigation'
import type { Vec2 } from '../world/types'
import { newRouteId, newZoneId, useFlow } from './store'
import { refreshRoute, validateRoute } from './validate'
import type { FlowSnapshot, PlannedRoute, RouteMode, TrafficZone, TrafficZoneType } from './types'

let started = false
let revalidateTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced full revalidation after geometry commits (not every drag frame). */
const REVALIDATE_MS = 80

function cloneWaypoints(wps: Vec2[]): Vec2[] {
  return wps.map((p) => [p[0], p[1]] as Vec2)
}

export function flowSnapshot(): FlowSnapshot {
  const s = useFlow.getState()
  return {
    routes: Object.values(s.routes).map((r) => ({
      ...r,
      waypoints: cloneWaypoints(r.waypoints),
      trajectory: cloneWaypoints(r.trajectory),
      assignedAgentIds: [...r.assignedAgentIds],
    })),
    trafficZones: Object.values(s.trafficZones).map((z) => ({
      ...z,
      position: [...z.position] as TrafficZone['position'],
      size: [...z.size] as TrafficZone['size'],
      direction: z.direction ? ([...z.direction] as Vec2) : undefined,
      restrictedAgents: z.restrictedAgents ? [...z.restrictedAgents] : undefined,
    })),
  }
}

export function loadFlowSnapshot(snap: FlowSnapshot | null | undefined) {
  if (!snap) {
    useFlow.getState().clear()
    return
  }
  const routes = (snap.routes ?? []).map((r) => {
    const base: PlannedRoute = {
      id: r.id,
      name: r.name,
      mode: r.mode,
      waypoints: cloneWaypoints(r.waypoints ?? []),
      assignedAgentIds: [...(r.assignedAgentIds ?? [])],
      status: r.status === 'draft' ? 'draft' : 'valid',
      trajectory: [],
      visible: r.visible !== false,
      message: undefined,
    }
    return base
  })
  const zones = snap.trafficZones ?? []
  useFlow.getState().replaceAll(routes, zones)
  revalidateAllRoutes()
}

export function revalidateAllRoutes() {
  const world = useWorld.getState()
  const flow = useFlow.getState()
  const zones = Object.values(flow.trafficZones)
  const next: Record<string, PlannedRoute> = {}
  for (const r of Object.values(flow.routes)) {
    if (r.status === 'draft') {
      next[r.id] = r
      continue
    }
    next[r.id] = refreshRoute(r, world.objects, zones)
  }
  useFlow.getState().setRoutes(next)
  syncActiveRouteToNav()
}

function scheduleRevalidate() {
  if (revalidateTimer) clearTimeout(revalidateTimer)
  revalidateTimer = setTimeout(() => {
    revalidateTimer = null
    // Skip while the user is mid-drag — wait for commit (dragging → false still bumps geometry).
    if (useWorld.getState().dragging) {
      scheduleRevalidate()
      return
    }
    revalidateAllRoutes()
  }, REVALIDATE_MS)
}

/**
 * When a Flow route is assigned to the robot, push its multi-waypoint trajectory into nav
 * so intermediate intent points are honored (default nav is start→single goal).
 */
export function syncActiveRouteToNav() {
  const flow = useFlow.getState()
  const id = flow.activeRouteId
  if (!id || flow.simulationPaused) return
  const route = flow.routes[id]
  if (!route || !route.assignedAgentIds.includes('robot')) return

  startNavigation()
  const world = useWorld.getState()
  const zones = Object.values(flow.trafficZones)

  if (route.waypoints.length < 2) {
    useNav.setState({ path: [], status: 'idle' })
    return
  }

  // Plan from the live robot pose through remaining intent waypoints (never drop user order).
  const remaining = remainingWaypointsFromRobot(route.waypoints, robotRuntime.pos)
  const result = validateRoute(remaining.length >= 2 ? remaining : [robotRuntime.pos, ...route.waypoints], world.objects, zones)
  if (result.status === 'unreachable' || result.status === 'blocked' || result.trajectory.length < 2) {
    useNav.setState({
      path: result.trajectory,
      status: 'no-path',
      blockedPath: useNav.getState().path.length > 1 ? useNav.getState().path : null,
      blockedAt: performance.now(),
    })
    return
  }

  const goal = route.waypoints[route.waypoints.length - 1]
  if (!world.goal || world.goal[0] !== goal[0] || world.goal[1] !== goal[1]) {
    world.setGoal(goal)
  }
  robotRuntime.target = 1
  useNav.setState({
    path: result.trajectory,
    status: 'moving',
  })
}

/** Drop waypoints the robot has already passed (closest ahead along the sequence). */
export function remainingWaypointsFromRobot(waypoints: Vec2[], pos: Vec2): Vec2[] {
  if (waypoints.length === 0) return [[pos[0], pos[1]]]
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < waypoints.length; i++) {
    const d = Math.hypot(waypoints[i][0] - pos[0], waypoints[i][1] - pos[1])
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  // If very close to a waypoint, start from the next one.
  const start = bestD < 0.6 && best < waypoints.length - 1 ? best + 1 : best
  const rest = waypoints.slice(start)
  if (rest.length === 0) return [[pos[0], pos[1]], waypoints[waypoints.length - 1]]
  if (Math.hypot(rest[0][0] - pos[0], rest[0][1] - pos[1]) < 0.15) return rest
  return [[pos[0], pos[1]], ...rest]
}

export function beginRouteDraft(mode: RouteMode = 'waypoint', name?: string) {
  const n = Object.keys(useFlow.getState().routes).length + 1
  useFlow.getState().setDraft({
    mode,
    waypoints: [],
    name: name ?? `Route ${n}`,
  })
  useWorld.getState().setTool('route')
}

export function addDraftWaypoint(at: Vec2) {
  const flow = useFlow.getState()
  if (!flow.draft) {
    beginRouteDraft('waypoint')
  }
  const draft = useFlow.getState().draft!
  const wp: Vec2 = [at[0], at[1]]
  useFlow.getState().setDraft({ ...draft, waypoints: [...draft.waypoints, wp] })
}

export function undoDraftWaypoint() {
  const draft = useFlow.getState().draft
  if (!draft || draft.waypoints.length === 0) return
  useFlow.getState().setDraft({ ...draft, waypoints: draft.waypoints.slice(0, -1) })
}

export function cancelRouteDraft() {
  useFlow.getState().setDraft(null)
}

export function finishRouteDraft(): PlannedRoute | null {
  const draft = useFlow.getState().draft
  if (!draft || draft.waypoints.length < 2) return null
  const world = useWorld.getState()
  const zones = Object.values(useFlow.getState().trafficZones)
  const result = validateRoute(draft.waypoints, world.objects, zones)
  const route: PlannedRoute = {
    id: newRouteId(),
    name: draft.name,
    mode: draft.mode,
    waypoints: cloneWaypoints(draft.waypoints),
    assignedAgentIds: [],
    status: result.status,
    trajectory: result.trajectory,
    message: result.message,
    visible: true,
  }
  useFlow.getState().upsertRoute(route)
  useFlow.getState().setDraft(null)
  useFlow.getState().selectRoute(route.id)
  return route
}

export function createAutomaticRoute(from: Vec2, to: Vec2, name?: string): PlannedRoute {
  const world = useWorld.getState()
  const zones = Object.values(useFlow.getState().trafficZones)
  const waypoints: Vec2[] = [
    [from[0], from[1]],
    [to[0], to[1]],
  ]
  const result = validateRoute(waypoints, world.objects, zones)
  const n = Object.keys(useFlow.getState().routes).length + 1
  const route: PlannedRoute = {
    id: newRouteId(),
    name: name ?? `Route ${n}`,
    mode: 'automatic',
    waypoints,
    assignedAgentIds: [],
    status: result.status,
    trajectory: result.trajectory,
    message: result.message,
    visible: true,
  }
  useFlow.getState().upsertRoute(route)
  useFlow.getState().selectRoute(route.id)
  return route
}

export function updateRouteWaypoints(id: string, waypoints: Vec2[]) {
  const cur = useFlow.getState().routes[id]
  if (!cur) return
  const world = useWorld.getState()
  const zones = Object.values(useFlow.getState().trafficZones)
  const next = refreshRoute({ ...cur, waypoints: cloneWaypoints(waypoints) }, world.objects, zones)
  useFlow.getState().upsertRoute(next)
  if (useFlow.getState().activeRouteId === id) syncActiveRouteToNav()
}

export function moveRouteWaypoint(id: string, index: number, at: Vec2) {
  const cur = useFlow.getState().routes[id]
  if (!cur || index < 0 || index >= cur.waypoints.length) return
  const waypoints = cloneWaypoints(cur.waypoints)
  waypoints[index] = [at[0], at[1]]
  updateRouteWaypoints(id, waypoints)
}

export function removeRouteWaypoint(id: string, index: number) {
  const cur = useFlow.getState().routes[id]
  if (!cur || cur.waypoints.length <= 2) return
  const waypoints = cur.waypoints.filter((_, i) => i !== index)
  updateRouteWaypoints(id, waypoints)
}

export function renameRoute(id: string, name: string) {
  const cur = useFlow.getState().routes[id]
  if (!cur) return
  useFlow.getState().upsertRoute({ ...cur, name: name.trim() || cur.name })
}

export function deleteRoute(id: string) {
  useFlow.getState().removeRoute(id)
}

export function reverseRoute(id: string) {
  const cur = useFlow.getState().routes[id]
  if (!cur) return
  updateRouteWaypoints(id, [...cur.waypoints].reverse())
}

export function duplicateRoute(id: string): PlannedRoute | null {
  const cur = useFlow.getState().routes[id]
  if (!cur) return null
  const copy: PlannedRoute = {
    ...cur,
    id: newRouteId(),
    name: `${cur.name} copy`,
    waypoints: cloneWaypoints(cur.waypoints),
    trajectory: cloneWaypoints(cur.trajectory),
    assignedAgentIds: [],
  }
  useFlow.getState().upsertRoute(copy)
  useFlow.getState().selectRoute(copy.id)
  return copy
}

/** Assign route to the primary robot and start following the trajectory. */
export function assignRouteToRobot(id: string): { ok: true } | { ok: false; error: string } {
  const route = useFlow.getState().routes[id]
  if (!route) return { ok: false, error: 'Route not found.' }
  if (route.waypoints.length < 2) return { ok: false, error: 'Route needs at least two waypoints.' }
  if (route.status === 'unreachable' || route.status === 'blocked') {
    return { ok: false, error: route.message ?? 'Route is not traversable.' }
  }
  const assigned = route.assignedAgentIds.includes('robot')
    ? route.assignedAgentIds
    : [...route.assignedAgentIds, 'robot']
  useFlow.getState().upsertRoute({ ...route, assignedAgentIds: assigned })
  useFlow.getState().setActiveRouteId(id)
  useFlow.getState().setSimulationPaused(false)
  syncActiveRouteToNav()
  const nav = useNav.getState()
  if (nav.status === 'no-path') return { ok: false, error: 'No path for the robot along this route.' }
  return { ok: true }
}

export function clearRouteAssignment(id: string) {
  const route = useFlow.getState().routes[id]
  if (!route) return
  useFlow.getState().upsertRoute({
    ...route,
    assignedAgentIds: route.assignedAgentIds.filter((a) => a !== 'robot'),
  })
  if (useFlow.getState().activeRouteId === id) {
    useFlow.getState().setActiveRouteId(null)
    useNav.setState({ path: [], status: 'idle' })
  }
}

export function addTrafficZone(
  type: TrafficZoneType,
  at: Vec2,
  size: [number, number, number] = [4, 0.1, 4],
): TrafficZone {
  const n = Object.keys(useFlow.getState().trafficZones).length + 1
  const zone: TrafficZone = {
    id: newZoneId(),
    name: `${type} ${n}`,
    type,
    position: [at[0], 0, at[1]],
    size: [...size],
    rotationY: 0,
    ...(type === 'one-way' ? { direction: [1, 0] as Vec2 } : {}),
    ...(type === 'slow' ? { speedLimit: 0.8 } : {}),
  }
  useFlow.getState().upsertZone(zone)
  scheduleRevalidate()
  return zone
}

export function deleteTrafficZone(id: string) {
  useFlow.getState().removeZone(id)
  scheduleRevalidate()
}

export function pauseSimulation() {
  useFlow.getState().setSimulationPaused(true)
  useNav.setState({ status: 'idle' })
}

export function resumeSimulation() {
  useFlow.getState().setSimulationPaused(false)
  syncActiveRouteToNav()
}

/**
 * Wire Flow to the world store. Safe to call more than once.
 * Registers after navigation so active-route sync wins over single-goal replan.
 */
export function startFlow() {
  if (started) return
  started = true
  startNavigation()
  useWorld.subscribe((s, prev) => {
    if (s.geometryVersion !== prev.geometryVersion) {
      // Commit-time (click place): revalidate immediately. Mid-drag: debounce until release.
      if (s.dragging) scheduleRevalidate()
      else revalidateAllRoutes()
    } else if (s.dragging !== prev.dragging && !s.dragging) {
      revalidateAllRoutes()
    }
  })
  // After nav's own geometry replan, restore multi-waypoint path when a Flow route is active.
  useWorld.subscribe((s, prev) => {
    if (s.geometryVersion === prev.geometryVersion && s.goal === prev.goal && s.robotVersion === prev.robotVersion) return
    if (useFlow.getState().activeRouteId) {
      // Defer so navigation.ts replan runs first.
      queueMicrotask(() => syncActiveRouteToNav())
    }
  })
}
