import { create } from 'zustand'
import { useWorld } from '../world/store'
import { navObstacles, type Vec2 } from '../world/types'
import { buildGrid, type Grid } from './grid'

export type NavStatus = 'idle' | 'moving' | 'paused' | 'arrived' | 'no-path'

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
