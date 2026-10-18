/**
 * Multi-waypoint robot route planner.
 * Waypoints are ordered stops; Play drives the existing A* navigator one leg at a time.
 * Desktop HUD and XR palette call the same actions — no gesture rewrites.
 */
import { create } from 'zustand'
import { useWorld } from '../world/store'
import type { Vec2 } from '../world/types'
import { useNav } from './navState'

function syncRoutePlayToNav() {
  const playState = useRoutePlan.getState().playState
  const nav = useNav.getState()
  if (nav.path.length <= 1) return
  if (playState === 'paused' && nav.status === 'moving') useNav.setState({ status: 'paused' })
  if (playState === 'playing' && nav.status === 'paused') useNav.setState({ status: 'moving' })
}

export type RoutePlayState = 'idle' | 'playing' | 'paused' | 'done'

export interface RoutePlanState {
  waypoints: Vec2[]
  /** Index of the waypoint currently being pursued. */
  activeIndex: number
  playState: RoutePlayState
}

const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05

export const useRoutePlan = create<RoutePlanState>(() => ({
  waypoints: [],
  activeIndex: 0,
  playState: 'idle',
}))

export function getRoutePlan(): RoutePlanState {
  return useRoutePlan.getState()
}

/** Append a stop. Does not start the robot — call playRoute(). */
export function addWaypoint(point: Vec2): { ok: true; index: number } | { ok: false; error: string } {
  if (!point.every(Number.isFinite)) return { ok: false, error: 'Invalid waypoint.' }
  const { waypoints, playState } = useRoutePlan.getState()
  const last = waypoints[waypoints.length - 1]
  if (last && same(last, point)) return { ok: false, error: 'Waypoint is too close to the previous one.' }
  const next = [...waypoints, [point[0], point[1]] as Vec2]
  useRoutePlan.setState({
    waypoints: next,
    playState: playState === 'done' ? 'idle' : playState,
  })
  return { ok: true, index: next.length - 1 }
}

export function removeLastWaypoint(): { ok: true } | { ok: false; error: string } {
  const { waypoints, playState, activeIndex } = useRoutePlan.getState()
  if (!waypoints.length) return { ok: false, error: 'No waypoints to remove.' }
  if (playState === 'playing' || playState === 'paused') {
    return { ok: false, error: 'Stop the route before editing waypoints.' }
  }
  const next = waypoints.slice(0, -1)
  useRoutePlan.setState({
    waypoints: next,
    activeIndex: Math.min(activeIndex, Math.max(0, next.length - 1)),
    playState: 'idle',
  })
  if (!next.length) useWorld.getState().setGoal(null)
  return { ok: true }
}

export function clearRoute(): void {
  useRoutePlan.setState({ waypoints: [], activeIndex: 0, playState: 'idle' })
  useWorld.getState().setGoal(null)
}

/** Replace any planned route with a single destination and start immediately (voice / catalog go-to). */
export function setImmediateDestination(point: Vec2): void {
  useRoutePlan.setState({ waypoints: [[point[0], point[1]]], activeIndex: 0, playState: 'playing' })
  useWorld.getState().setGoal([point[0], point[1]])
}

export function playRoute(): { ok: true } | { ok: false; error: string } {
  const { waypoints, playState, activeIndex } = useRoutePlan.getState()
  if (!waypoints.length) return { ok: false, error: 'Add at least one waypoint first.' }
  if (useWorld.getState().robotEnabled === false) return { ok: false, error: 'Place the robot first.' }

  if (playState === 'paused') {
    useRoutePlan.setState({ playState: 'playing' })
    syncRoutePlayToNav()
    return { ok: true }
  }

  const startIndex = playState === 'done' ? 0 : Math.min(activeIndex, waypoints.length - 1)
  useRoutePlan.setState({ playState: 'playing', activeIndex: startIndex })
  useWorld.getState().setGoal([...waypoints[startIndex]] as Vec2)
  return { ok: true }
}

export function pauseRoute(): { ok: true } | { ok: false; error: string } {
  const { playState, waypoints } = useRoutePlan.getState()
  if (!waypoints.length) return { ok: false, error: 'No route to pause.' }
  if (playState !== 'playing') return { ok: false, error: 'Route is not playing.' }
  useRoutePlan.setState({ playState: 'paused' })
  syncRoutePlayToNav()
  return { ok: true }
}

/** Stop movement but keep waypoints. Resets to the first stop. */
export function stopRoute(): void {
  useRoutePlan.setState({ playState: 'idle', activeIndex: 0 })
  useWorld.getState().setGoal(null)
}

export function skipToNextWaypoint(): { ok: true } | { ok: false; error: string } {
  const { waypoints, activeIndex, playState } = useRoutePlan.getState()
  if (!waypoints.length) return { ok: false, error: 'No waypoints.' }
  if (playState !== 'playing' && playState !== 'paused') {
    return { ok: false, error: 'Play the route to skip stops.' }
  }
  if (activeIndex >= waypoints.length - 1) return { ok: false, error: 'Already at the last waypoint.' }
  const next = activeIndex + 1
  useRoutePlan.setState({ activeIndex: next, playState: 'playing' })
  useWorld.getState().setGoal([...waypoints[next]] as Vec2)
  return { ok: true }
}

/**
 * Called when the robot reaches the current nav goal.
 * Advances to the next planned waypoint, or marks the route done.
 */
export function onNavArrived(): void {
  const { waypoints, activeIndex, playState } = useRoutePlan.getState()
  if (playState !== 'playing' && playState !== 'paused') return
  if (!waypoints.length) return
  if (activeIndex < waypoints.length - 1) {
    const next = activeIndex + 1
    useRoutePlan.setState({ activeIndex: next, playState: 'playing' })
    useWorld.getState().setGoal([...waypoints[next]] as Vec2)
    return
  }
  useRoutePlan.setState({ playState: 'done' })
}

export function routeStatusLabel(state: RoutePlanState = useRoutePlan.getState()): string {
  const n = state.waypoints.length
  if (!n) return 'No waypoints'
  if (state.playState === 'playing') return `Playing · stop ${state.activeIndex + 1} of ${n}`
  if (state.playState === 'paused') return `Paused · stop ${state.activeIndex + 1} of ${n}`
  if (state.playState === 'done') return `Finished · ${n} stop${n === 1 ? '' : 's'}`
  return `${n} waypoint${n === 1 ? '' : 's'} · ready`
}
