import { useWorld } from './store'
import type { ActorKind } from '../actors/types'
import type { ObjectKind, Vec2, WorldObject } from './types'

/**
 * "Which things?" for voice and other callers that name objects instead of clicking them:
 * "it", "them", "the houses", "the second house", "all the trees", "the people".
 * Pure lookups on the world store; nothing here changes the world.
 */

/** What a spoken reference points at. Everything is optional; an empty target means "it". */
export interface Target {
  /** "it" (selection, else the last thing made) or "them" (the last batch, else the selection). */
  ref?: 'it' | 'them'
  kind?: ObjectKind
  /** Building or tree style ("the houses", "the pine trees"). */
  style?: string
  /** Platform/wall material ("the road" is an asphalt platform). */
  material?: string
  /** Event/catalog ids ("the booths"). */
  catalogId?: string
  assetId?: string
  /** People and vehicles. `true` = any actor kind. */
  actor?: ActorKind | true
  /** "the houses" (true) vs "the house" (false). */
  plural?: boolean
  /** "all the trees": every match, not just the last batch. */
  all?: boolean
  /** "the second house": 1-based, in creation order. */
  ordinal?: number
  /** Spoken noun, for messages ("house", "road"). */
  label?: string
}

/** The objects created by the last batch, so "move them" can find them. */
let lastBatch: string[] = []
let lastActorBatch: string[] = []
/** Which batch came last, so a bare "them" means the newest things, not older objects. */
let lastWasActors = false
export const setLastBatch = (ids: string[]) => {
  lastBatch = [...ids]
  lastWasActors = false
}
export const setLastActorBatch = (ids: string[]) => {
  lastActorBatch = [...ids]
  lastWasActors = true
}
export const getLastBatch = () => lastBatch.filter((id) => useWorld.getState().objects[id])
export const getLastActorBatch = () => lastActorBatch.filter((id) => useWorld.getState().actors[id])

export function matchesTarget(o: WorldObject, t: Target): boolean {
  if (t.kind && o.kind !== t.kind) return false
  if (t.style && o.style !== t.style) return false
  if (t.material && (o.material ?? (o.kind === 'platform' ? 'concrete' : undefined)) !== t.material) return false
  if (t.catalogId && o.catalogId !== t.catalogId) return false
  if (t.assetId && o.assetId !== t.assetId) return false
  return true
}

const isDescribed = (t: Target) => Boolean(t.kind || t.style || t.material || t.catalogId || t.assetId)

/** Object ids a target names, in creation order. Empty when nothing matches. */
export function resolveObjects(t: Target = {}): string[] {
  const w = useWorld.getState()
  if (t.actor) return []
  const selected = w.selectedId && w.objects[w.selectedId] ? w.selectedId : null
  const last = getLastBatch()
  if (!isDescribed(t)) {
    if (t.ref === 'them') return lastWasActors && getLastActorBatch().length ? [] : last.length ? last : selected ? [selected] : []
    return selected ? [selected] : last.slice(-1)
  }
  // Insertion order of the record is creation order (ids are never reused).
  const all = Object.values(w.objects).filter((o) => matchesTarget(o, t)).map((o) => o.id)
  if (!all.length) return []
  if (t.ordinal) return all[t.ordinal - 1] ? [all[t.ordinal - 1]] : []
  if (t.all) return all
  if (t.plural) {
    const recent = last.filter((id) => all.includes(id))
    return recent.length ? recent : all
  }
  if (selected && all.includes(selected)) return [selected]
  const recent = last.filter((id) => all.includes(id))
  return [recent.length ? recent[recent.length - 1] : all[all.length - 1]]
}

/** Actor ids a target names ("the people", "the workers", "them" after adding people). */
export function resolveActors(t: Target = {}): string[] {
  const w = useWorld.getState()
  const last = getLastActorBatch()
  if (!t.actor) {
    // "them" / "it" right after adding people means those people.
    if (isDescribed(t)) return []
    if (t.ref === 'them') return lastWasActors ? last : []
    const sel = w.selectedActorId && w.actors[w.selectedActorId] ? [w.selectedActorId] : []
    return sel.length ? sel : []
  }
  const all = Object.values(w.actors).filter((a) => t.actor === true || a.kind === t.actor).map((a) => a.id)
  if (!all.length) return []
  if (t.ordinal) return all[t.ordinal - 1] ? [all[t.ordinal - 1]] : []
  if (t.all) return all
  const recent = last.filter((id) => all.includes(id))
  if (t.plural) return recent.length ? recent : all
  if (w.selectedActorId && all.includes(w.selectedActorId)) return [w.selectedActorId]
  return [recent.length ? recent[recent.length - 1] : all[all.length - 1]]
}

/** Centre of the things a target names, for "near the houses" / "between the road and the tower". */
export function targetCenter(t: Target): Vec2 | null {
  const w = useWorld.getState()
  const pts: Vec2[] = [
    ...resolveObjects(t).map((id) => [w.objects[id].position[0], w.objects[id].position[2]] as Vec2),
    ...resolveActors(t).map((id) => [...w.actors[id].position] as Vec2),
  ]
  if (!pts.length) return null
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}

/** Most recent road (asphalt platform): the spine new buildings line up along. */
export function latestRoad(): WorldObject | null {
  const roads = Object.values(useWorld.getState().objects).filter((o) => o.kind === 'platform' && o.material === 'asphalt')
  const last = getLastBatch()
  return roads.find((r) => last.includes(r.id)) ?? roads[roads.length - 1] ?? null
}
