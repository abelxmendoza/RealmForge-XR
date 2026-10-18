import { WORLD, type Vec2 } from '../world/types'
import { ACTOR_CATALOG, MAX_ACTORS, isActorKind, type Actor } from './types'

export function parseActors(input: unknown, usedIds: Set<string>, freshId: () => string): { ok: true; actors: Actor[]; warnings: string[] } | { ok: false; error: string } {
  if (input === undefined) return { ok: true, actors: [], warnings: [] }
  if (!Array.isArray(input) || input.length > MAX_ACTORS) return { ok: false, error: `Actors must be an array of at most ${MAX_ACTORS} entries.` }
  const actors: Actor[] = [], warnings: string[] = []
  const point = (value: unknown): value is Vec2 => Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= WORLD.half)
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || !isActorKind(raw.kind)) return { ok: false, error: `Actor ${i}: unknown actor type.` }
    if (!point(raw.position) || raw.goal !== null && raw.goal !== undefined && !point(raw.goal)) {
      return { ok: false, error: `Actor ${i}: position and goal must be finite local [x, z] coordinates.` }
    }
    if (!Array.isArray(raw.size) || raw.size.length !== 3 || raw.size.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v) || v < 0.3 || v > 8)) {
      return { ok: false, error: `Actor ${i}: dimensions must be 0.3–8 meters.` }
    }
    if (typeof raw.speed !== 'number' || !Number.isFinite(raw.speed) || raw.speed < 0.1 || raw.speed > 8 || typeof raw.rotationY !== 'number' || !Number.isFinite(raw.rotationY)) {
      return { ok: false, error: `Actor ${i}: invalid speed or rotation.` }
    }
    let route: Vec2[] = []
    if (raw.route !== undefined) {
      if (!Array.isArray(raw.route) || raw.route.length > 32 || !raw.route.every(point)) {
        return { ok: false, error: `Actor ${i}: route must be an array of at most 32 [x, z] stops.` }
      }
      route = raw.route.map((p) => [...p] as Vec2)
    } else if (point(raw.goal)) {
      route = [[...raw.goal] as Vec2]
    }
    const goal = route[0] ? ([...route[0]] as Vec2) : point(raw.goal) ? ([...raw.goal] as Vec2) : null
    let id = typeof raw.id === 'string' ? raw.id : ''
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || usedIds.has(id)) {
      do {
        id = freshId()
      } while (usedIds.has(id))
      warnings.push(`Actor ${i}: invalid or duplicate id replaced.`)
    }
    usedIds.add(id)
    const kind = raw.kind as Actor['kind']
    const preset = ACTOR_CATALOG[kind]
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 48) : ''
    const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : preset.color
    if (!name || color !== raw.color) warnings.push(`Actor ${i}: name or color repaired.`)
    const speed = raw.speed as number
    const rotationY = raw.rotationY as number
    actors.push({
      id,
      kind,
      name: name || preset.name,
      color,
      size: [...(raw.size as Actor['size'])],
      speed,
      rotationY,
      position: [...(raw.position as Vec2)],
      goal,
      route,
    })
  }
  return { ok: true, actors, warnings }
}
