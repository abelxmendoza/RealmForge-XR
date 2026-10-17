import { useWorld } from '../world/store'
import { navObstacles, WORLD, type Vec2 } from '../world/types'
import { buildGrid, isBlocked, worldToCell, pathIsClear, type Grid } from '../nav/grid'
import { planPath } from '../nav/astar'
import { ACTOR_CATALOG, actorRadius, cloneActor, type Actor } from './types'

export type ActorStatus = 'idle' | 'moving' | 'arrived' | 'no-path'
export interface ActorRuntime {
  position: Vec2
  heading: number
  path: Vec2[]
  target: number
  status: ActorStatus
  replanCount: number
}
/** Frame poses and paths only. Authoring data stays in the single world store. */
const runtimes = new Map<string, ActorRuntime>()
const listeners = new Set<() => void>()
let revision = 0
let installed = false
export const actorRuntimeRevision = () => revision
export function subscribeActorRuntime(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify) } }
function publish() { ++revision; listeners.forEach((notify) => notify()) }
export const getActorRuntime = (id: string) => runtimes.get(id)
const samePoint = (a: Vec2 | null, b: Vec2 | null) => a === b || !!a && !!b && a[0] === b[0] && a[1] === b[1]
let gridCache = new Map<number, Grid>()
let geometry = -1
export function gridForActor(actor: Actor): Grid {
  const state = useWorld.getState()
  if (geometry !== state.geometryVersion) { geometry = state.geometryVersion; gridCache = new Map() }
  const radius = actorRadius(actor)
  let grid = gridCache.get(radius)
  if (!grid) { grid = buildGrid(navObstacles(state.objects), { inflate: radius }); gridCache.set(radius, grid) }
  return grid
}
function plan(actor: Actor, runtime: ActorRuntime) {
  ++runtime.replanCount
  if (!actor.goal) { runtime.path = []; runtime.target = 0; runtime.status = 'idle'; return }
  const grid = gridForActor(actor)
  const start = worldToCell(grid, runtime.position), end = worldToCell(grid, actor.goal)
  // Never let nearest-free-cell fallback send a large vehicle through an obstructed destination.
  const path = isBlocked(grid, ...start) || isBlocked(grid, ...end) ? null : planPath(grid, runtime.position, actor.goal)
  runtime.path = path ?? []
  runtime.target = 1
  runtime.status = path ? path.length > 1 ? 'moving' : 'arrived' : 'no-path'
}
function sync(state: ReturnType<typeof useWorld.getState>, prev?: ReturnType<typeof useWorld.getState>) {
  const fullLoad = !prev || state.actorLoadVersion !== prev.actorLoadVersion
  let changed = false
  for (const id of runtimes.keys()) if (!state.actors[id]) { runtimes.delete(id); changed = true }
  for (const actor of Object.values(state.actors)) {
    let runtime = runtimes.get(actor.id)
    const before = prev?.actors[actor.id]
    const teleport = fullLoad || !runtime || !before || !samePoint(actor.position, before.position)
    if (!runtime || teleport) {
      runtime = { position: [...actor.position], heading: actor.rotationY, path: [], target: 0, status: 'idle', replanCount: runtime?.replanCount ?? 0 }
      runtimes.set(actor.id, runtime)
    }
    if (teleport || state.geometryVersion !== prev?.geometryVersion || !samePoint(actor.goal, before?.goal ?? null) || !before || actor.size.some((v, i) => v !== before.size[i])) {
      plan(actor, runtime); changed = true
    } else if (actor.rotationY !== before.rotationY && (runtime.status !== 'moving' || state.dragging && state.selectedActorId === actor.id)) runtime.heading = actor.rotationY
  }
  if (changed) publish()
}
export function startActors() {
  if (installed) return
  installed = true
  sync(useWorld.getState())
  useWorld.subscribe((state, prev) => {
    if (state.actors !== prev.actors || state.geometryVersion !== prev.geometryVersion || state.actorLoadVersion !== prev.actorLoadVersion) sync(state, prev)
  })
}
/** One render-loop tick for every actor, independent of the legacy single robot. */
export function tickActors(delta: number) {
  const state = useWorld.getState()
  const dt = Math.max(0, Math.min(delta, 0.1))
  let changed = false
  for (const actor of Object.values(state.actors)) {
    const runtime = runtimes.get(actor.id)
    if (!runtime || runtime.status !== 'moving' || state.dragging && state.selectedActorId === actor.id) continue
    let budget = actor.speed * dt
    const grid = gridForActor(actor)
    while (budget > 0 && runtime.target < runtime.path.length) {
      const next = runtime.path[runtime.target]
      const dx = next[0] - runtime.position[0], dz = next[1] - runtime.position[1]
      const distance = Math.hypot(dx, dz)
      const travel = Math.min(budget, distance)
      const candidate: Vec2 = distance < 1e-6 ? [...next] : [runtime.position[0] + dx / distance * travel, runtime.position[1] + dz / distance * travel]
      if (!pathIsClear(grid, [runtime.position, candidate])) { plan(actor, runtime); changed = true; break }
      if (distance > 1e-6) {
        let turn = Math.atan2(dx, dz) - runtime.heading
        turn = Math.atan2(Math.sin(turn), Math.cos(turn))
        runtime.heading += turn * Math.min(1, ACTOR_CATALOG[actor.kind].turnRate * dt)
      }
      runtime.position = candidate
      budget -= travel
      if (distance <= travel + 1e-6) ++runtime.target
      else break
    }
    if (runtime.target >= runtime.path.length && runtime.status === 'moving') { runtime.status = 'arrived'; changed = true }
  }
  if (changed) publish()
}
/** A save captures live poses; loading restarts navigation toward each saved goal. */
export function actorsForSave(): Actor[] {
  return Object.values(useWorld.getState().actors).map((actor) => {
    const runtime = runtimes.get(actor.id)
    return cloneActor({ ...actor, position: runtime ? runtime.position : actor.position, rotationY: runtime?.heading ?? actor.rotationY })
  })
}
