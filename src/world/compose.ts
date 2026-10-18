import { useWorld } from './store'
import { WORLD, blocksNavigation, type Vec2, type Vec3, type WorldObject } from './types'
import { footprintsOverlap } from './assets'
import { anchorPoint, fits, objectFor, oneUndoStep, spawnObjects, spiral, type Placement, type SpawnSpec } from './spawn'
import { snapAngle } from './snap'
import { latestRoad, setLastActorBatch, setLastBatch } from './targets'
import { setActorLoop, setActorGoal, spawnActors } from '../actors/actions'
import type { ActorKind } from '../actors/types'

/**
 * Lay out several kinds of thing from one sentence as a little scene instead of one spiral each:
 * "add 3 lampposts, a road and two houses with a few people walking around".
 *
 * - A road is the spine: placed first, long enough for what lines it.
 * - Buildings line both sides facing the road, streetlights run along its edges, trees fill gaps.
 * - People start on the road and, when asked, walk up and down it.
 * - With no road, everything clusters around one spot, buildings first.
 *
 * Every object still goes through `fits()`, so nothing overlaps a solid, leaves the board, or sits
 * on the robot or its goal. The whole scene is one undo step.
 */

export interface SceneItem {
  spec: SpawnSpec
  label: string
  count: number
  placement?: Placement
}

export type ActorBehaviour = 'wander' | 'goal' | 'idle'

export interface SceneActors {
  kind: ActorKind
  label: string
  count: number
  behaviour?: ActorBehaviour
  placement?: Placement
}

export interface SceneLine {
  label: string
  made: number
  requested: number
  actor?: boolean
  behaviour?: ActorBehaviour
}

export interface SceneResult {
  lines: SceneLine[]
  objectIds: string[]
  actorIds: string[]
}

const isRoad = (s: SpawnSpec) => s.kind === 'platform' && s.material === 'asphalt' && !s.assetId
const isHouseLike = (s: SpawnSpec) => s.kind === 'building' && !s.assetId
/** "in a row" / "near the houses" / "20 m north" keeps an item out of the street layout. A plain anchor ("near the goal") just moves the whole scene. */
const pinned = (p?: Placement) => Boolean(p && (p.near || p.between || p.direction || p.arrange || p.point))
const anchored = (p?: Placement) => Boolean(p && p.anchor && p.anchor !== 'auto')

/** Road frame: centre, unit vector along it, unit vector across it, length and width. */
interface Spine {
  c: Vec2
  u: Vec2
  n: Vec2
  length: number
  width: number
}

function spineOf(road: Pick<WorldObject, 'position' | 'size' | 'rotationY'>): Spine {
  // Local x maps to (cos θ, -sin θ) in world x/z (see footprintsOverlap); the long side is the road.
  const alongX = road.size[0] >= road.size[2]
  const θ = road.rotationY + (alongX ? 0 : Math.PI / 2)
  return {
    c: [road.position[0], road.position[2]],
    u: [Math.cos(θ), -Math.sin(θ)],
    n: [Math.sin(θ), Math.cos(θ)],
    length: Math.max(road.size[0], road.size[2]),
    width: Math.min(road.size[0], road.size[2]),
  }
}

const at = (s: Spine, t: number, off: number): Vec2 => [s.c[0] + s.u[0] * t + s.n[0] * off, s.c[1] + s.u[1] * t + s.n[1] * off]
const yawOf = (s: Spine) => Math.atan2(-s.u[1], s.u[0])
const inside = ([x, z]: Vec2, margin = 1) => Math.abs(x) < WORLD.half - margin && Math.abs(z) < WORLD.half - margin

/** Put down one road of `length` near `center`, trying east–west first, then north–south. */
function placeRoad(spec: SpawnSpec, center: Vec2, length: number, width: number, others: Omit<WorldObject, 'id'>[], margin = 0): string | null {
  const base = objectFor(spec, center)
  if (!base) return null
  // First look for open ground with room for what will line the road (`margin` each side), so a new
  // street doesn't land in the middle of an old one; then settle for anywhere the road itself fits.
  if (margin > 0) {
    for (const yaw of [0, Math.PI / 2]) {
      for (const c of spiral(center, 2, WORLD.half)) {
        const probe = { position: [c[0], 0, c[1]] as Vec3, size: [length + 4, 1, width + margin * 2] as Vec3, rotationY: yaw }
        const ex = yaw ? probe.size[2] / 2 : probe.size[0] / 2
        const ez = yaw ? probe.size[0] / 2 : probe.size[2] / 2
        if (Math.abs(c[0]) + ex > WORLD.half || Math.abs(c[1]) + ez > WORLD.half) continue
        if (others.some((o) => footprintsOverlap(probe, o))) continue
        const w = useWorld.getState()
        if ([w.robotStart, w.goal].some((p) => p && footprintsOverlap(probe, { position: [p[0], 0, p[1]], size: [1, 1, 1], rotationY: 0 }))) continue
        const o = { ...base, position: [c[0], 0, c[1]] as Vec3, size: [length, base.size[1], width] as Vec3, rotationY: yaw }
        const id = useWorld.getState().addObject(o)
        others.push(o)
        return id
      }
    }
  }
  for (const yaw of [0, Math.PI / 2]) {
    for (const c of spiral(center, 2, WORLD.half)) {
      const o = { ...base, position: [c[0], 0, c[1]] as Vec3, size: [length, base.size[1], width] as Vec3, rotationY: yaw }
      if (!fits(o, others, 0)) continue
      const id = useWorld.getState().addObject(o)
      others.push(o)
      return id
    }
  }
  return null
}

/** Decorations may overlap roads but not each other. */
const clearOf = (o: Omit<WorldObject, 'id'>, decor: Omit<WorldObject, 'id'>[]) => decor.every((d) => !footprintsOverlap(o, d))

function tryAdd(o: Omit<WorldObject, 'id'>, others: Omit<WorldObject, 'id'>[], decor: Omit<WorldObject, 'id'>[], gap: number): string | null {
  if (!fits(o, others, gap)) return null
  if (!blocksNavigation(o as WorldObject) && !clearOf(o, decor)) return null
  const id = useWorld.getState().addObject(o)
  others.push(o)
  if (!blocksNavigation(o as WorldObject)) decor.push(o)
  return id
}

/** Buildings alternate sides of the road and face it. */
function lineBuildings(s: Spine, item: SceneItem, others: Omit<WorldObject, 'id'>[], decor: Omit<WorldObject, 'id'>[]): string[] {
  const sample = objectFor(item.spec, [0, 0])
  if (!sample) return []
  const bw = sample.size[0]
  const bd = sample.size[2]
  const perSide = Math.ceil(item.count / 2)
  const pitch = bw + 3
  const ids: string[] = []
  for (let i = 0; i < item.count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const slot = Math.floor(i / 2)
    const t0 = (slot - (perSide - 1) / 2) * pitch
    const off = side * (s.width / 2 + 2 + bd / 2)
    // A building on the far side turns round so its front faces the street.
    const rotationY = snapAngle(yawOf(s) + (side > 0 ? Math.PI : 0))
    for (const dt of [0, 2, -2, 4, -4, 6, -6]) {
      const p = at(s, t0 + dt, off)
      if (!inside(p, Math.max(bw, bd) / 2)) continue
      const o = objectFor(item.spec, p)
      if (!o) break
      const id = tryAdd({ ...o, rotationY }, others, decor, 0.5)
      if (id) {
        ids.push(id)
        break
      }
    }
  }
  return ids
}

/** Streetlights along both kerbs, evenly spaced. */
function lineLights(s: Spine, item: SceneItem, others: Omit<WorldObject, 'id'>[], decor: Omit<WorldObject, 'id'>[]): string[] {
  const ids: string[] = []
  const perSide = Math.ceil(item.count / 2)
  const usable = s.length - 2
  for (let i = 0; i < item.count; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const slot = Math.floor(i / 2)
    // Stagger the two sides so lights don't stand in pairs.
    const t = -usable / 2 + (usable / perSide) * (slot + (side < 0 ? 0.25 : 0.75))
    for (const dt of [0, 1, -1, 2, -2]) {
      const o = objectFor(item.spec, at(s, t + dt, side * (s.width / 2 + 0.6)))
      if (!o) break
      const id = tryAdd({ ...o, rotationY: snapAngle(yawOf(s)) }, others, decor, 0)
      if (id) {
        ids.push(id)
        break
      }
    }
  }
  return ids
}

/** Trees in the strips beside the road, filling the gaps between buildings. */
function lineTrees(s: Spine, item: SceneItem, others: Omit<WorldObject, 'id'>[], decor: Omit<WorldObject, 'id'>[]): string[] {
  const sample = objectFor(item.spec, [0, 0])
  if (!sample) return []
  const r = Math.max(sample.size[0], sample.size[2]) / 2
  const ids: string[] = []
  const half = s.length / 2 + 4
  const spots: Vec2[] = []
  for (const off of [s.width / 2 + 2 + r, s.width / 2 + 6 + r, s.width / 2 + 12 + r]) {
    for (let t = -half; t <= half; t += 2) spots.push(at(s, t, -off), at(s, t, off))
  }
  // Spread them out: walk the spots with a stride instead of filling one end first.
  const order = spots.map((_, i) => (i * 7) % spots.length)
  for (const i of order) {
    if (ids.length >= item.count) break
    const p = spots[i]
    if (!inside(p, r)) continue
    const o = objectFor(item.spec, p)
    if (!o) break
    const id = tryAdd(o, others, decor, 0.3)
    if (id) ids.push(id)
  }
  return ids
}

/** Points for actors on the road, and the two ends of it to walk between. */
function roadSpots(s: Spine, n: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) out.push(at(s, ((i + 0.5) / n - 0.5) * (s.length - 2), ((i % 3) - 1) * (s.width / 4)))
  return out
}

function walkLoop(s: Spine | null, from: Vec2, i: number): Vec2[] {
  if (s) {
    const lane = ((i % 3) - 1) * (s.width / 4)
    const end = s.length / 2 - 1.5
    return i % 2 ? [at(s, end, lane), at(s, -end, lane)] : [at(s, -end, lane), at(s, end, lane)]
  }
  // No road: a small square around where they stand, in a different order per actor.
  const r = 5 + (i % 3) * 2
  const square: Vec2[] = [[from[0] + r, from[1]], [from[0], from[1] + r], [from[0] - r, from[1]], [from[0], from[1] - r]]
  return square.slice(i % 4).concat(square.slice(0, i % 4))
}

const PRIORITY: Record<string, number> = { platform: 0, building: 1, wall: 2, rack: 2, pallet: 3, prop: 3, crate: 4, streetlight: 5, tree: 6 }

/** Build the scene. Items and actors keep the order they were spoken in for the summary. */
export function composeScene(items: SceneItem[], actors: SceneActors[] = [], opts: { alongRoad?: boolean } = {}): SceneResult {
  const lines: SceneLine[] = []
  const madeByItem = new Map<SceneItem, string[]>()
  const actorIds: string[] = []
  const objectIds: string[] = []

  oneUndoStep(() => {
    const others: Omit<WorldObject, 'id'>[] = Object.values(useWorld.getState().objects)
    const decor: Omit<WorldObject, 'id'>[] = others.filter((o) => !blocksNavigation(o as WorldObject) && !(o.kind === 'platform'))
    const anchorFrom = items.find((i) => anchored(i.placement) && !pinned(i.placement))?.placement ?? actors.find((a) => anchored(a.placement))?.placement ?? {}
    const center = anchorPoint({ anchor: anchorFrom.anchor ?? 'auto' })

    // 1. The spine: a road from this sentence, or the latest road when asked to line it.
    let spine: Spine | null = null
    const roadItem = items.find((i) => isRoad(i.spec) && !pinned(i.placement))
    if (roadItem) {
      const houses = items.filter((i) => isHouseLike(i.spec) && !pinned(i.placement))
      const longest = houses.reduce((m, h) => {
        const o = objectFor(h.spec, [0, 0])
        return Math.max(m, Math.ceil(h.count / 2) * ((o?.size[0] ?? 9) + 3))
      }, 0)
      const lights = items.filter((i) => i.spec.kind === 'streetlight').reduce((n, i) => n + i.count, 0)
      const length = Math.min(WORLD.half * 2 - 4, Math.max(16, longest + 4, Math.ceil(lights / 2) * 8))
      const width = houses.length || actors.length ? 6 : 4
      const deepest = houses.reduce((m, h) => Math.max(m, objectFor(h.spec, [0, 0])?.size[2] ?? 0), 0)
      const treeRoom = items.some((i) => i.spec.kind === 'tree') ? 6 : 1
      const id = placeRoad(roadItem.spec, center, Math.round(length), width, others, Math.max(deepest + 2.5, treeRoom))
      const made = id ? [id] : []
      // Extra roads ("two roads") go wherever there's room.
      if (roadItem.count > 1) made.push(...spawnObjects(roadItem.spec, roadItem.count - 1, { anchor: 'auto' }).ids)
      madeByItem.set(roadItem, made)
      if (id) spine = spineOf(useWorld.getState().objects[id])
    } else if (opts.alongRoad) {
      const road = latestRoad()
      if (road) spine = spineOf(road)
    }

    // 2. Everything else, biggest first so small things fill in around them.
    const rest = items.filter((i) => i !== roadItem).sort((a, b) => (PRIORITY[a.spec.kind] ?? 3) - (PRIORITY[b.spec.kind] ?? 3))
    for (const item of rest) {
      let ids: string[] = []
      if (spine && !pinned(item.placement)) {
        if (isHouseLike(item.spec)) ids = lineBuildings(spine, item, others, decor)
        else if (item.spec.kind === 'streetlight') ids = lineLights(spine, item, others, decor)
        else if (item.spec.kind === 'tree') ids = lineTrees(spine, item, others, decor)
      }
      if (ids.length < item.count) {
        // Not a street piece, or the street was full: the usual free-ground search, just off the street.
        const placement: Placement = pinned(item.placement) ? item.placement! : spine ? { point: at(spine, 0, spine.width / 2 + 14) } : { point: center }
        const extra = spawnObjects(item.spec, item.count - ids.length, placement)
        ids.push(...extra.ids)
        others.push(...extra.ids.map((id) => useWorld.getState().objects[id]))
      }
      madeByItem.set(item, ids)
    }

    // 3. People and vehicles.
    const sceneCenter = (): Vec2 => {
      const placed = [...madeByItem.values()].flat().map((id) => useWorld.getState().objects[id]).filter(Boolean)
      if (!placed.length) return center
      return [placed.reduce((s, o) => s + o.position[0], 0) / placed.length, placed.reduce((s, o) => s + o.position[2], 0) / placed.length]
    }
    for (const a of actors) {
      const onRoad = spine && !pinned(a.placement)
      const origin = pinned(a.placement) || (anchored(a.placement) && !spine) ? anchorPoint(a.placement) : spine ? spine.c : sceneCenter()
      const ids = spawnActors(a.kind, a.count, origin, onRoad ? roadSpots(spine!, a.count) : [])
      ids.forEach((id, i) => {
        const pos = useWorld.getState().actors[id]?.position
        if (!pos) return
        if (a.behaviour === 'wander') setActorLoop(id, walkLoop(onRoad ? spine : null, pos, i))
        else if (a.behaviour === 'goal' && useWorld.getState().goal) setActorGoal(id, useWorld.getState().goal)
      })
      actorIds.push(...ids)
      lines.push({ label: a.label, made: ids.length, requested: a.count, actor: true, behaviour: a.behaviour })
    }
  })

  // Summary in the order things were said; "them" afterwards means the last thing said.
  const ordered: SceneLine[] = []
  for (const item of items) {
    const ids = madeByItem.get(item) ?? []
    objectIds.push(...ids)
    ordered.push({ label: item.label, made: ids.length, requested: item.count })
  }
  const lastItem = [...items].reverse().find((i) => (madeByItem.get(i) ?? []).length)
  if (actors.length && actorIds.length) setLastActorBatch(actorIds)
  if (lastItem) {
    const ids = madeByItem.get(lastItem)!
    setLastBatch(ids)
    if (!actorIds.length) useWorld.getState().select(ids[ids.length - 1])
  }
  return { lines: [...ordered, ...lines], objectIds, actorIds }
}
