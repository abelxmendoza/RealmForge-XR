import { useWorld } from '../world/store'
import { useEditor } from '../editor/settings'
import { WORLD, type Vec2 } from '../world/types'
import { isBlocked, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'
import { ACTOR_CATALOG, MAX_ACTORS, actorRadius, actorRoute, isActorKind, type Actor, type ActorKind } from './types'
import { getActorRuntime, gridForActor, startActors } from './runtime'

export type ActorResult = { ok: true; id?: string } | { ok: false; error: string }
export function selectActorKind(kind: string): boolean {
  if (!isActorKind(kind)) return false
  useEditor.getState().set({ actorKind: kind })
  useWorld.getState().setTool('actor')
  return true
}
function nameFor(base: string) {
  const names = new Set(Object.values(useWorld.getState().actors).map((actor) => actor.name.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}
export function previewActor(at: Vec2, kind: ActorKind = useEditor.getState().actorKind) {
  if (!isActorKind(kind) || !at.every(Number.isFinite)) return null
  const preset = ACTOR_CATALOG[kind]
  const actor: Actor = {
    id: 'preview',
    kind,
    name: nameFor(preset.name),
    color: preset.color,
    position: [...at],
    rotationY: 0,
    size: [...preset.size],
    speed: preset.speed,
    goal: null,
    route: [],
  }
  const radius = actorRadius(actor)
  actor.position = actor.position.map((v) => Math.max(-WORLD.half + radius, Math.min(WORLD.half - radius, useEditor.getState().snap ? Math.round(v / WORLD.cell) * WORLD.cell : v))) as Vec2
  return { actor, valid: validPose(actor) && Object.keys(useWorld.getState().actors).length < MAX_ACTORS }
}
function validPose(actor: Actor, ignoreId?: string) {
  const grid = gridForActor(actor)
  if (isBlocked(grid, ...worldToCell(grid, actor.position))) return false
  const radius = actorRadius(actor)
  if (actor.position.some((value) => Math.abs(value) + radius > WORLD.half)) return false
  return Object.values(useWorld.getState().actors).every((other) => {
    if (other.id === ignoreId) return true
    const position = getActorRuntime(other.id)?.position ?? other.position
    return Math.hypot(position[0] - actor.position[0], position[1] - actor.position[1]) >= actorRadius(other) + radius
  })
}
export function placeActor(at: Vec2, kind: ActorKind = useEditor.getState().actorKind): ActorResult {
  startActors()
  const preview = previewActor(at, kind)
  if (!preview?.valid) return { ok: false, error: `Choose clear ground with room for this actor (maximum ${MAX_ACTORS} actors).` }
  const { id: omitted, ...actor } = preview.actor
  return { ok: true, id: useWorld.getState().addActor(actor) }
}
export function selectActor(id: string | null) { useWorld.getState().selectActor(id) }
export function updateActor(id: string, patch: Partial<Omit<Actor, 'id' | 'kind'>>): ActorResult {
  const current = useWorld.getState().actors[id]
  if (!current) return { ok: false, error: 'Actor no longer exists.' }
  const actor = { ...current, ...patch }
  if (!actor.name.trim() || actor.name.length > 48 || !/^#[0-9a-fA-F]{6}$/.test(actor.color)) return { ok: false, error: 'Use a name of 1–48 characters and a valid color.' }
  if (!Number.isFinite(actor.speed) || actor.speed < 0.1 || actor.speed > 8 || !Number.isFinite(actor.rotationY) || !actor.position.every(Number.isFinite) || actor.size.some((v) => !Number.isFinite(v) || v < 0.3 || v > 8)) return { ok: false, error: 'Speed must be 0.1–8 m/s and dimensions 0.3–8 m.' }
  if ((patch.position || patch.size) && !validPose({ ...actor, position: patch.position ?? getActorRuntime(id)?.position ?? actor.position }, id)) return { ok: false, error: 'This actor would overlap an obstacle, another actor, or the world boundary.' }
  useWorld.getState().updateActor(id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}) })
  return { ok: true }
}
function validateStop(actor: Actor, stop: Vec2, from: Vec2): ActorResult {
  if (!stop.every(Number.isFinite) || stop.some((v) => Math.abs(v) + actorRadius(actor) > WORLD.half)) {
    return { ok: false, error: 'Destination is outside the navigable world.' }
  }
  const grid = gridForActor(actor)
  if (isBlocked(grid, ...worldToCell(grid, stop))) return { ok: false, error: 'Destination is obstructed for this actor’s size.' }
  if (isBlocked(grid, ...worldToCell(grid, from)) || !planPath(grid, from, stop)) {
    return { ok: false, error: 'No route for this actor.' }
  }
  return { ok: true }
}

/** Replace the planned route with a single stop (or clear). Works for every actor kind. */
export function setActorGoal(id: string, goal: Vec2 | null): ActorResult {
  startActors()
  const actor = useWorld.getState().actors[id]
  if (!actor) return { ok: false, error: 'Select an actor first.' }
  if (goal) {
    const position = getActorRuntime(id)?.position ?? actor.position
    const check = validateStop(actor, goal, position)
    if (!check.ok) return check
  }
  useWorld.getState().updateActor(id, { goal: goal ? [...goal] : null, route: goal ? [[...goal] as Vec2] : [] })
  return { ok: true }
}

/** Append a stop to this actor’s planned route (multi-stop). */
export function appendActorWaypoint(id: string, stop: Vec2): ActorResult {
  startActors()
  const actor = useWorld.getState().actors[id]
  if (!actor) return { ok: false, error: 'Select an actor first.' }
  const route = actorRoute(actor)
  const from = route.length ? route[route.length - 1]! : getActorRuntime(id)?.position ?? actor.position
  const check = validateStop(actor, stop, from)
  if (!check.ok) return check
  const next = [...route, [...stop] as Vec2]
  useWorld.getState().updateActor(id, { goal: [...next[0]!] as Vec2, route: next })
  return { ok: true }
}

export function sendActorToDestination(actorId: string, markerId: string): ActorResult {
  const marker = useWorld.getState().objects[markerId]
  return marker?.destinationRole ? setActorGoal(actorId, [marker.position[0], marker.position[2]]) : { ok: false, error: 'That destination no longer exists.' }
}

/** Add a destination-marker stop onto the end of an actor’s planned route. */
export function appendActorDestination(actorId: string, markerId: string): ActorResult {
  const marker = useWorld.getState().objects[markerId]
  return marker?.destinationRole ? appendActorWaypoint(actorId, [marker.position[0], marker.position[2]]) : { ok: false, error: 'That destination no longer exists.' }
}

export function duplicateActor(id: string): ActorResult {
  const actor = useWorld.getState().actors[id]
  if (!actor || Object.keys(useWorld.getState().actors).length >= MAX_ACTORS) return { ok: false, error: 'Cannot duplicate this actor.' }
  const position = getActorRuntime(id)?.position ?? actor.position
  const offset = actorRadius(actor) * 2 + WORLD.cell
  for (const [x, z] of [[offset, 0], [-offset, 0], [0, offset], [0, -offset]]) {
    const copy = { ...actor, name: nameFor(actor.name), position: [position[0] + x, position[1] + z] as Vec2, goal: null, route: [] }
    if (validPose(copy)) { const { id: omitted, ...value } = copy; return { ok: true, id: useWorld.getState().addActor(value) } }
  }
  return { ok: false, error: 'No clear space next to this actor.' }
}
export function removeActor(id: string) { useWorld.getState().removeActor(id) }

/**
 * Put `count` actors on clear ground near `center` (voice: "a few people", "two delivery robots").
 * `spots` are tried first (e.g. points along a road), then a widening ring. Returns the new ids.
 */
export function spawnActors(kind: ActorKind, count: number, center: Vec2, spots: Vec2[] = []): string[] {
  const ids: string[] = []
  const want = Math.max(0, Math.min(count, MAX_ACTORS - Object.keys(useWorld.getState().actors).length))
  const step = actorRadius(ACTOR_CATALOG[kind]) * 2 + WORLD.cell * 2
  const ring = function* (): Generator<Vec2> {
    yield center
    for (let r = step; r < WORLD.half; r += step) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / step))
      for (let i = 0; i < n; i++) yield [center[0] + Math.cos((i / n) * Math.PI * 2) * r, center[1] + Math.sin((i / n) * Math.PI * 2) * r]
    }
  }
  for (const at of [...spots, ...ring()]) {
    if (ids.length >= want) break
    const placed = placeActor(at, kind)
    if (placed.ok && placed.id) ids.push(placed.id)
  }
  return ids
}

/**
 * Keep an actor walking a loop through `stops` (voice: "walking around"). Stops the actor can't
 * reach are skipped; with fewer than two reachable stops the actor keeps its old route.
 */
export function setActorLoop(id: string, stops: Vec2[]): ActorResult {
  const actor = useWorld.getState().actors[id]
  if (!actor) return { ok: false, error: 'Actor no longer exists.' }
  const first = setActorGoal(id, null)
  if (!first.ok) return first
  let added = 0
  for (const stop of stops) if (appendActorWaypoint(id, stop).ok) added++
  if (added < 2) {
    // Leave the actor doing whatever it was doing before.
    useWorld.getState().updateActor(id, { goal: actor.goal, route: actor.route, loop: actor.loop })
    return { ok: false, error: 'No room for this actor to walk around.' }
  }
  useWorld.getState().updateActor(id, { loop: true })
  return { ok: true }
}

/** Speed up or slow down actors (clamped to the 0.1–8 m/s the panel allows). */
export function scaleActorSpeed(ids: string[], factor: number): number {
  let n = 0
  for (const id of ids) {
    const a = useWorld.getState().actors[id]
    if (a && updateActor(id, { speed: Math.max(0.1, Math.min(8, a.speed * factor)) }).ok) n++
  }
  return n
}

/** Stop where they are: clear the route and the loop. */
export function stopActors(ids: string[]): number {
  let n = 0
  for (const id of ids) {
    if (!useWorld.getState().actors[id]) continue
    const position = getActorRuntime(id)?.position ?? useWorld.getState().actors[id].position
    useWorld.getState().updateActor(id, { goal: null, route: [], loop: false, position: [...position] as Vec2 })
    n++
  }
  return n
}
