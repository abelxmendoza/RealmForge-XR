import { footprintsOverlap } from '../world/assets'
import { buildGrid, isBlocked, nearestFree, cellToWorld, worldToCell, pathIsClear } from '../nav/grid'
import { blocksNavigation, WORLD, type Vec2, type WorldObject } from '../world/types'
import { navObstacles } from '../world/types'
import type { PlannedRoute } from './types'
import { useWorld } from '../world/store'
import { useFlow } from './store'
import { robotRuntime } from '../nav/navigation'

function clampPoint(p: Vec2, margin = 0): Vec2 {
  return [
    Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, p[0])),
    Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, p[1])),
  ]
}

export type PlacementIssue =
  | 'overlap'
  | 'out-of-bounds'
  | 'agent-overlap'
  | 'blocks-route'
  | 'blocks-destination'
  | 'blocks-exit'

export interface PlacementValidation {
  valid: boolean
  /** Hard failures that should prevent commit. */
  reject: boolean
  issues: PlacementIssue[]
  reasons: string[]
  /** Suggested nearby centre if the requested spot is invalid. */
  suggestion: Vec2 | null
  /** Routes that would be forced to replan or become blocked. */
  affectedRouteIds: string[]
}

function agentFootprint(at: Vec2): Pick<WorldObject, 'position' | 'size' | 'rotationY'> {
  const d = WORLD.robotRadius * 2
  return { position: [at[0], 0, at[1]], size: [d, 1, d], rotationY: 0 }
}

function exitsBlocked(object: Omit<WorldObject, 'id'>, objects: WorldObject[]): boolean {
  return objects.some(
    (o) =>
      (o.simulationRole === 'exit' || o.destinationRole === 'delivery') &&
      blocksNavigation(object as WorldObject) &&
      footprintsOverlap(object, o),
  )
}

function destinationBlocked(object: Omit<WorldObject, 'id'>, objects: WorldObject[]): boolean {
  if (!blocksNavigation(object as WorldObject)) return false
  return objects.some((o) => {
    if (!o.destinationRole && o.simulationRole !== 'registration' && o.simulationRole !== 'booth') return false
    const goal: Vec2 = [o.position[0], o.position[2]]
    const probe = { ...object, id: '__probe__' } as WorldObject
    const grid = buildGrid(navObstacles([...objects.filter((x) => x.id !== (object as WorldObject).id), probe]))
    return isBlocked(grid, ...worldToCell(grid, goal))
  })
}

function routesImpacted(
  object: Omit<WorldObject, 'id'>,
  objects: WorldObject[],
  routes: PlannedRoute[],
  ignoreId?: string,
): string[] {
  if (!blocksNavigation(object as WorldObject)) return []
  const probe = { ...object, id: '__probe__' } as WorldObject
  const others = objects.filter((o) => o.id !== ignoreId)
  const grid = buildGrid(navObstacles([...others, probe]))
  const hit: string[] = []
  for (const r of routes) {
    if (r.waypoints.length < 2) continue
    const poly = r.trajectory.length > 1 ? r.trajectory : r.waypoints
    if (!pathIsClear(grid, poly)) hit.push(r.id)
  }
  return hit
}

/** Find a nearby free centre that does not overlap solids (spiral search). */
export function suggestNearestValid(
  object: Omit<WorldObject, 'id'>,
  objects: Iterable<WorldObject>,
  ignoreId?: string,
): Vec2 | null {
  const list = [...objects].filter((o) => o.id !== ignoreId)
  const start: Vec2 = [object.position[0], object.position[2]]
  const grid = buildGrid(navObstacles(list), { inflate: 0 })
  const free = nearestFree(grid, worldToCell(grid, start))
  if (!free) return null

  const maxR = 12
  for (let r = 0; r <= maxR; r += WORLD.cell) {
    const steps = Math.max(1, Math.round((2 * Math.PI * Math.max(r, WORLD.cell)) / WORLD.cell))
    for (let s = 0; s < steps; s++) {
      const ang = (s / steps) * Math.PI * 2
      const candidate: Vec2 = clampPoint([start[0] + Math.cos(ang) * r, start[1] + Math.sin(ang) * r])
      const probe = {
        ...object,
        position: [candidate[0], object.position[1], candidate[1]] as WorldObject['position'],
      }
      const margin = Math.hypot(probe.size[0], probe.size[2]) / 2
      if (Math.abs(candidate[0]) > WORLD.half - margin || Math.abs(candidate[1]) > WORLD.half - margin) continue
      if (list.some((o) => blocksNavigation(o) && footprintsOverlap(probe, o))) continue
      if (footprintsOverlap(probe, agentFootprint(robotRuntime.pos))) continue
      return candidate
    }
  }
  return cellToWorld(grid, free)
}

/**
 * Validate a prospective object pose. Overlaps and out-of-bounds reject;
 * route/destination impacts warn but do not silently relocate.
 */
export function validatePlacement(
  object: Omit<WorldObject, 'id'> & { id?: string },
  opts: { objects?: WorldObject[]; routes?: PlannedRoute[]; ignoreId?: string } = {},
): PlacementValidation {
  const objects = opts.objects ?? Object.values(useWorld.getState().objects)
  const routes = opts.routes ?? Object.values(useFlow.getState().routes)
  const ignoreId = opts.ignoreId ?? object.id
  const others = objects.filter((o) => o.id !== ignoreId)

  const issues: PlacementIssue[] = []
  const reasons: string[] = []

  const margin = Math.hypot(object.size[0], object.size[2]) / 2
  const cx = object.position[0]
  const cz = object.position[2]
  if (Math.abs(cx) > WORLD.half - margin || Math.abs(cz) > WORLD.half - margin) {
    issues.push('out-of-bounds')
    reasons.push('Object is outside the venue bounds.')
  }

  if (others.some((o) => blocksNavigation(o) && blocksNavigation(object as WorldObject) && footprintsOverlap(object, o))) {
    issues.push('overlap')
    reasons.push('Overlaps another solid object.')
  }

  if (blocksNavigation(object as WorldObject) && footprintsOverlap(object, agentFootprint(robotRuntime.pos))) {
    issues.push('agent-overlap')
    reasons.push('Overlaps the robot. Move the robot or choose another spot.')
  }

  const affectedRouteIds = routesImpacted(object, objects, routes, ignoreId)
  if (affectedRouteIds.length) {
    issues.push('blocks-route')
    reasons.push(
      affectedRouteIds.length === 1
        ? 'Blocks a planned route — a detour will be calculated if you place here.'
        : `Blocks ${affectedRouteIds.length} planned routes — detours will be calculated if you place here.`,
    )
  }

  if (destinationBlocked(object, others)) {
    issues.push('blocks-destination')
    reasons.push('Blocks a destination marker.')
  }

  if (exitsBlocked(object, others)) {
    issues.push('blocks-exit')
    reasons.push('Blocks a designated exit. This is a planning warning, not a code-compliance check.')
  }

  const hard = issues.some((i) => i === 'overlap' || i === 'out-of-bounds' || i === 'agent-overlap')
  const suggestion =
    hard || issues.includes('blocks-exit') ? suggestNearestValid(object, objects, ignoreId) : null

  return {
    valid: !hard,
    reject: hard,
    issues,
    reasons,
    suggestion,
    affectedRouteIds,
  }
}

/** Format a short HUD message for placement feedback. */
export function placementMessage(v: PlacementValidation, requested?: Vec2): string {
  if (v.valid && v.reasons.length === 0) return 'Placement OK.'
  const base = v.reasons[0] ?? (v.reject ? 'Invalid placement.' : 'Placement warning.')
  if (v.suggestion && requested) {
    const dx = v.suggestion[0] - requested[0]
    const dz = v.suggestion[1] - requested[1]
    const dist = Math.hypot(dx, dz)
    const dir = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 'right' : 'left') : dz >= 0 ? 'forward' : 'back'
    return `${base} Suggested: ${dist.toFixed(1)} m to the ${dir}.`
  }
  if (v.suggestion) {
    return `${base} Suggested position: (${v.suggestion[0].toFixed(1)}, ${v.suggestion[1].toFixed(1)}).`
  }
  return base
}
