import { create } from 'zustand'
import { useWorld } from '../world/store'
import { navObstacles, type Vec2 } from '../world/types'
import { planPath } from './astar'
import { buildGrid, pathIsClear, type Grid } from './grid'

export type NavStatus = 'idle' | 'moving' | 'arrived' | 'no-path'

export interface NavState {
  grid: Grid
  /** Remaining route, first point = where the robot was when it was planned. */
  path: Vec2[]
  status: NavStatus
  replanCount: number
  /** The route that was invalidated by the last edit; drawn briefly in red. */
  blockedPath: Vec2[] | null
  /** performance.now() of the last replan caused by a blocked route. */
  blockedAt: number
}

/**
 * Live robot pose. Mutated every frame by <Robot>, so it lives outside React state.
 * Navigation reads it when it replans so the new route starts where the robot actually is.
 */
export const robotRuntime = {
  pos: [...useWorld.getState().robotStart] as Vec2,
  heading: 0,
  /** Index of the waypoint in `path` the robot is walking toward. */
  target: 1,
}

export const useNav = create<NavState>(() => ({
  grid: buildGrid(navObstacles(useWorld.getState().objects)),
  path: [],
  status: 'idle',
  replanCount: 0,
  blockedPath: null,
  blockedAt: 0,
}))

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
  const wasActive = nav.status === 'moving' && before.length > 1
  const blocked = reason === 'geometry' && wasActive && !pathIsClear(grid, before)

  const path = planPath(grid, robotRuntime.pos, goal)
  robotRuntime.target = 1
  useNav.setState({
    grid,
    path: path ?? [],
    status: path ? (path.length > 1 ? 'moving' : 'arrived') : 'no-path',
    replanCount: nav.replanCount + 1,
    ...(blocked ? { blockedPath: before, blockedAt: performance.now() } : {}),
  })
}

/** Called by <Robot> when it reaches the last waypoint. */
export function markArrived() {
  useNav.setState({ status: 'arrived' })
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
