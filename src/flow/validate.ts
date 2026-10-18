import { planPath } from '../nav/astar'
import { buildGrid, isBlocked, pathIsClear, worldToCell, type Grid } from '../nav/grid'
import { navObstacles, WORLD, type Vec2, type WorldObject } from '../world/types'
import type { PlannedRoute, RouteStatus, TrafficZone } from './types'

/** Synthetic solid footprints for no-go traffic zones. */
export function noGoObstacles(zones: Iterable<TrafficZone>): WorldObject[] {
  const out: WorldObject[] = []
  for (const z of zones) {
    if (z.type !== 'no-go' && z.type !== 'restricted') continue
    out.push({
      id: `flow-zone-${z.id}`,
      kind: 'building',
      position: [...z.position],
      size: [...z.size],
      rotationY: z.rotationY,
      solid: true,
    })
  }
  return out
}

/** Occupancy grid including solid world objects and no-go / restricted zones. */
export function buildFlowGrid(
  objects: Record<string, WorldObject> | WorldObject[],
  zones: Iterable<TrafficZone>,
): Grid {
  const list = Array.isArray(objects) ? objects : Object.values(objects)
  return buildGrid([...navObstacles(list), ...noGoObstacles(zones)])
}

/**
 * Chain A* between consecutive waypoints. Preserves waypoint order (intent).
 * Returns null if any leg is unreachable.
 */
export function computeTrajectory(grid: Grid, waypoints: Vec2[]): Vec2[] | null {
  if (waypoints.length < 2) return waypoints.length === 1 ? [[...waypoints[0]]] : []
  const out: Vec2[] = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = planPath(grid, waypoints[i], waypoints[i + 1])
    if (!leg) return null
    if (i === 0) out.push(...leg)
    else out.push(...leg.slice(1))
  }
  return out
}

/** True when a polyline segment runs against a one-way zone's direction. */
export function violatesOneWay(zones: Iterable<TrafficZone>, a: Vec2, b: Vec2): boolean {
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  if (dx * dx + dz * dz < 1e-8) return false
  for (const z of zones) {
    if (z.type !== 'one-way' || !z.direction) continue
    if (!pointInZone([mx, mz], z)) continue
    const [ox, oz] = z.direction
    const len = Math.hypot(ox, oz) || 1
    const nx = ox / len
    const nz = oz / len
    const travel = Math.hypot(dx, dz) || 1
    const tx = dx / travel
    const tz = dz / travel
    // Against the lane if the travel direction has a negative component along the one-way axis.
    if (tx * nx + tz * nz < -0.2) return true
  }
  return false
}

export function pointInZone(p: Vec2, z: TrafficZone): boolean {
  const cos = Math.cos(z.rotationY)
  const sin = Math.sin(z.rotationY)
  const dx = p[0] - z.position[0]
  const dz = p[1] - z.position[2]
  const lx = cos * dx + sin * dz
  const lz = -sin * dx + cos * dz
  return Math.abs(lx) <= z.size[0] / 2 && Math.abs(lz) <= z.size[2] / 2
}

function trajectoryRespectsOneWay(zones: Iterable<TrafficZone>, traj: Vec2[]): boolean {
  for (let i = 1; i < traj.length; i++) {
    if (violatesOneWay(zones, traj[i - 1], traj[i])) return false
  }
  return true
}

export type ValidateResult = {
  status: Exclude<RouteStatus, 'draft'>
  trajectory: Vec2[]
  message?: string
  /** True when A* found a path that differs from a straight intent polyline. */
  detoured: boolean
}

/**
 * Validate user waypoints against the current grid without mutating them.
 * Previous trajectory (if any) is used only to decide "replanned" vs "valid".
 */
export function validateRoute(
  waypoints: Vec2[],
  objects: Record<string, WorldObject> | WorldObject[],
  zones: Iterable<TrafficZone>,
  previousTrajectory?: Vec2[],
): ValidateResult {
  if (waypoints.length === 0) {
    return { status: 'unreachable', trajectory: [], message: 'Route has no waypoints.', detoured: false }
  }
  if (waypoints.length === 1) {
    const grid = buildFlowGrid(objects, zones)
    const cell = worldToCell(grid, waypoints[0])
    if (isBlocked(grid, ...cell)) {
      return { status: 'blocked', trajectory: [], message: 'Waypoint is inside an obstacle.', detoured: false }
    }
    return { status: 'valid', trajectory: [[...waypoints[0]]], detoured: false }
  }

  // Clamp intent points to map bounds for planning (intent arrays stay as stored).
  const clamped = waypoints.map(
    ([x, z]) =>
      [
        Math.max(-WORLD.half, Math.min(WORLD.half, x)),
        Math.max(-WORLD.half, Math.min(WORLD.half, z)),
      ] as Vec2,
  )

  const grid = buildFlowGrid(objects, zones)
  const traj = computeTrajectory(grid, clamped)
  if (!traj) {
    return {
      status: 'unreachable',
      trajectory: [],
      message: 'No navigable path through the waypoint sequence.',
      detoured: false,
    }
  }

  if (!pathIsClear(grid, traj)) {
    return {
      status: 'blocked',
      trajectory: traj,
      message: 'Computed path intersects obstacles.',
      detoured: false,
    }
  }

  if (!trajectoryRespectsOneWay(zones, traj)) {
    return {
      status: 'blocked',
      trajectory: traj,
      message: 'Path violates a one-way traffic zone.',
      detoured: false,
    }
  }

  const intentClear = pathIsClear(grid, clamped)
  const detoured = !intentClear
  // Yellow = currently detouring around geometry. Once the aisle is clear again, return to valid/green.
  if (detoured) {
    return {
      status: 'replanned',
      trajectory: traj,
      message: 'Detour around obstacles; original waypoints kept.',
      detoured: true,
    }
  }

  void previousTrajectory
  return { status: 'valid', trajectory: traj, detoured: false }
}

/** Recompute status + trajectory for a route, preserving id/name/mode/waypoints/assignments. */
export function refreshRoute(
  route: PlannedRoute,
  objects: Record<string, WorldObject> | WorldObject[],
  zones: Iterable<TrafficZone>,
): PlannedRoute {
  if (route.status === 'draft' && route.waypoints.length < 2) {
    return { ...route, trajectory: [], message: undefined }
  }
  const result = validateRoute(route.waypoints, objects, zones, route.trajectory)
  return {
    ...route,
    status: result.status,
    trajectory: result.trajectory,
    message: result.message,
  }
}
