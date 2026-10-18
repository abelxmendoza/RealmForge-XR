import type { Vec2, Vec3 } from '../world/types'

export const ACTOR_KINDS = ['worker', 'courier', 'vehicle'] as const
export type ActorKind = typeof ACTOR_KINDS[number]
export interface Actor {
  id: string
  kind: ActorKind
  name: string
  color: string
  /** Authoring/initial pose in map-local meters. Live movement is transient. */
  position: Vec2
  rotationY: number
  size: Vec3
  speed: number
  /** Current navigation target (first remaining stop). Kept for save/runtime compat. */
  goal: Vec2 | null
  /** Remaining planned stops in order; every actor kind can hold a multi-stop route. */
  route: Vec2[]
}
export const MAX_ACTORS = 32
export const ACTOR_CATALOG: Record<ActorKind, { name: string; color: string; size: Vec3; speed: number; turnRate: number }> = {
  worker: { name: 'Worker', color: '#ffb86b', size: [0.65, 1.8, 0.65], speed: 1.4, turnRate: 8 },
  courier: { name: 'Courier robot', color: '#65cdd0', size: [0.9, 1.1, 0.8], speed: 2.2, turnRate: 5 },
  vehicle: { name: 'Utility vehicle', color: '#a7bd72', size: [1.4, 1.5, 2.5], speed: 3, turnRate: 2 },
}
export const cloneActor = (actor: Actor): Actor => ({
  ...actor,
  position: [...actor.position],
  size: [...actor.size],
  goal: actor.goal ? [...actor.goal] : null,
  route: (actor.route ?? (actor.goal ? [actor.goal] : [])).map((p) => [...p] as Vec2),
})
/** Normalize legacy actors that only stored `goal`. */
export function actorRoute(actor: Pick<Actor, 'goal' | 'route'>): Vec2[] {
  if (actor.route?.length) return actor.route.map((p) => [...p] as Vec2)
  return actor.goal ? [[...actor.goal] as Vec2] : []
}
export const actorRadius = (actor: Pick<Actor, 'size'>) => Math.hypot(actor.size[0], actor.size[2]) / 2
export const isActorKind = (value: unknown): value is ActorKind => typeof value === 'string' && (ACTOR_KINDS as readonly string[]).includes(value)
