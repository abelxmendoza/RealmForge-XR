import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { startNavigation, useNav } from './navigation'
import {
  addWaypoint,
  clearRoute,
  pauseRoute,
  playRoute,
  removeLastWaypoint,
  skipToNextWaypoint,
  stopRoute,
  useRoutePlan,
  onNavArrived,
} from './routePlan'

describe('multi-waypoint route plan', () => {
  beforeEach(() => {
    useWorld.getState().loadWorld({
      objects: [],
      robotEnabled: true,
      robotStart: [0, 0],
      goal: null,
    })
    clearRoute()
    startNavigation()
  })

  it('adds multiple waypoints without starting the robot', () => {
    expect(addWaypoint([5, 5]).ok).toBe(true)
    expect(addWaypoint([10, -4]).ok).toBe(true)
    expect(addWaypoint([10, -4]).ok).toBe(false) // too close to last
    expect(useRoutePlan.getState().waypoints).toHaveLength(2)
    expect(useRoutePlan.getState().playState).toBe('idle')
    expect(useWorld.getState().goal).toBeNull()
    expect(useNav.getState().status).toBe('idle')
  })

  it('plays, pauses, resumes, and advances through stops', () => {
    addWaypoint([8, 0])
    addWaypoint([-8, 0])
    expect(playRoute().ok).toBe(true)
    expect(useRoutePlan.getState().playState).toBe('playing')
    expect(useWorld.getState().goal).toEqual([8, 0])
    expect(useNav.getState().status).toBe('moving')

    expect(pauseRoute().ok).toBe(true)
    expect(useRoutePlan.getState().playState).toBe('paused')
    expect(useNav.getState().status).toBe('paused')

    expect(playRoute().ok).toBe(true)
    expect(useRoutePlan.getState().playState).toBe('playing')
    expect(useNav.getState().status).toBe('moving')

    onNavArrived()
    expect(useRoutePlan.getState().activeIndex).toBe(1)
    expect(useWorld.getState().goal).toEqual([-8, 0])

    onNavArrived()
    expect(useRoutePlan.getState().playState).toBe('done')
  })

  it('skips to the next stop and can clear or remove when idle', () => {
    addWaypoint([4, 4])
    addWaypoint([-4, 4])
    addWaypoint([-4, -4])
    playRoute()
    expect(skipToNextWaypoint().ok).toBe(true)
    expect(useRoutePlan.getState().activeIndex).toBe(1)
    stopRoute()
    expect(useRoutePlan.getState().playState).toBe('idle')
    expect(removeLastWaypoint().ok).toBe(true)
    expect(useRoutePlan.getState().waypoints).toHaveLength(2)
    clearRoute()
    expect(useRoutePlan.getState().waypoints).toHaveLength(0)
  })
})
