import { useWorld } from '../world/store'
import { useEditor } from '../editor/settings'
import { WORLD, type Vec2 } from '../world/types'
import { isBlocked, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'
import { ACTOR_CATALOG, MAX_ACTORS, actorRadius, isActorKind, type Actor, type ActorKind } from './types'
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
  const actor: Actor = { id: 'preview', kind, name: nameFor(preset.name), color: preset.color, position: [...at], rotationY: 0, size: [...preset.size], speed: preset.speed, goal: null }
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
export function placeActor(at: Vec2): ActorResult {
  startActors()
  const preview = previewActor(at)
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
export function setActorGoal(id: string, goal: Vec2 | null): ActorResult {
  startActors()
  const actor = useWorld.getState().actors[id]
  if (!actor) return { ok: false, error: 'Select an actor first.' }
  if (goal) {
    if (!goal.every(Number.isFinite) || goal.some((v) => Math.abs(v) + actorRadius(actor) > WORLD.half)) return { ok: false, error: 'Destination is outside the navigable world.' }
    const grid = gridForActor(actor)
    if (isBlocked(grid, ...worldToCell(grid, goal))) return { ok: false, error: 'Destination is obstructed for this actor’s size.' }
    const position = getActorRuntime(id)?.position ?? actor.position
    if (isBlocked(grid, ...worldToCell(grid, position)) || !planPath(grid, position, goal)) return { ok: false, error: 'No route for this actor.' }
  }
  useWorld.getState().updateActor(id, { goal: goal ? [...goal] : null })
  return { ok: true }
}
export function sendActorToDestination(actorId: string, markerId: string): ActorResult {
  const marker = useWorld.getState().objects[markerId]
  return marker?.destinationRole ? setActorGoal(actorId, [marker.position[0], marker.position[2]]) : { ok: false, error: 'That destination no longer exists.' }
}
export function duplicateActor(id: string): ActorResult {
  const actor = useWorld.getState().actors[id]
  if (!actor || Object.keys(useWorld.getState().actors).length >= MAX_ACTORS) return { ok: false, error: 'Cannot duplicate this actor.' }
  const position = getActorRuntime(id)?.position ?? actor.position
  const offset = actorRadius(actor) * 2 + WORLD.cell
  for (const [x, z] of [[offset, 0], [-offset, 0], [0, offset], [0, -offset]]) {
    const copy = { ...actor, name: nameFor(actor.name), position: [position[0] + x, position[1] + z] as Vec2, goal: null }
    if (validPose(copy)) { const { id: omitted, ...value } = copy; return { ok: true, id: useWorld.getState().addActor(value) } }
  }
  return { ok: false, error: 'No clear space next to this actor.' }
}
export function removeActor(id: string) { useWorld.getState().removeActor(id) }
