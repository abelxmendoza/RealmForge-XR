import { useWorld } from '../world/store'
import { navObstacles, type Vec2 } from '../world/types'
import { planPath } from './astar'
import { buildGrid, pathIsClear } from './grid'
import { getRoutePlan, onNavArrived } from './routePlan'
import { robotRuntime, useNav, type NavStatus } from './navState'

export type { NavStatus, NavState } from './navState'
export { robotRuntime, useNav } from './navState'

/** Points the robot still has to walk: its position, then the waypoints ahead of it. */
export function remainingRoute(): Vec2[] {
  const { path } = useNav.getState()
  return [robotRuntime.pos, ...path.slice(robotRuntime.target)]
}

function replan(reason: 'geometry' | 'goal' | 'robot') {
  const world = useWorld.getState()
  const grid = buildGrid(navObstacles(world.objects))
  const nav = useNav.getState()
  const goal = world.goal

  if (!goal || world.robotEnabled === false) {
    useNav.setState({ grid, path: [], status: 'idle', blockedPath: null, blockedAt: 0 })
    return
  }

  const before = remainingRoute()
  const wasActive = (nav.status === 'moving' || nav.status === 'paused') && before.length > 1
  const blocked = reason === 'geometry' && wasActive && !pathIsClear(grid, before)

  const path = planPath(grid, robotRuntime.pos, goal)
  robotRuntime.target = 1
  const route = getRoutePlan()
  let status: NavStatus
  if (!path) status = 'no-path'
  else if (path.length <= 1) status = 'arrived'
  else if (route.playState === 'paused') status = 'paused'
  else status = 'moving'
  useNav.setState({
    grid,
    path: path ?? [],
    status,
    replanCount: nav.replanCount + 1,
    ...(blocked ? { blockedPath: before, blockedAt: performance.now() } : {}),
  })
}

/** Called by <Robot> when it reaches the last path point for the current goal. */
export function markArrived() {
  useNav.setState({ status: 'arrived' })
  onNavArrived()
}

let started = false
/**
 * Wire navigation to the world store: rebuild the grid and replan whenever geometry,
 * the goal, or the robot's placement changes. Safe to call more than once.
 */
export function startNavigation() {
  if (started) return
  started = true
  useWorld.subscribe((s, prev) => {
    if (s.robotVersion !== prev.robotVersion) {
      robotRuntime.pos = [...s.robotStart]
      replan('robot')
    } else if (s.geometryVersion !== prev.geometryVersion) replan('geometry')
    else if (s.goal !== prev.goal) replan('goal')
  })
  replan('goal')
}
