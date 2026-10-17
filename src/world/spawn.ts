import { useWorld } from './store'
import { WORLD, blocksNavigation, type BuildingStyle, type MaterialId, type ObjectKind, type TreeStyle, type Vec2, type Vec3, type WorldObject } from './types'
import { BUILDING_STYLES, DECOR_DEFAULTS, PLATFORM_DEFAULTS } from './catalog'
import { buildAsset, footprintsOverlap, getAsset } from './assets'
import type { AssetId } from './assetTypes'
import { snapAngle, snapFootprint, snapSize } from './snap'

/**
 * Batch create / move / rotate / resize for voice (and any other caller that speaks in
 * "how many" and "where" instead of exact coordinates). Pure store calls: navigation replans
 * on its own, and each batch is a single undo step.
 */

/** What to make. Only `kind` is required; the rest pick a look or a catalog item. */
export interface SpawnSpec {
  kind: ObjectKind
  style?: BuildingStyle | TreeStyle
  material?: MaterialId
  assetId?: AssetId
  /** 1 = default size. Applied to footprint and height. */
  scale?: number
  /** Extra height multiplier ("tall", "short"). */
  heightScale?: number
}

/** Where to put things: a named spot, optionally offset by a direction and distance. */
export type AnchorName = 'auto' | 'robot' | 'goal' | 'center' | 'selected'
export type Direction = 'north' | 'south' | 'east' | 'west'

export interface Placement {
  anchor?: AnchorName
  direction?: Direction
  /** Metres from the anchor along `direction`. */
  distance?: number
}

export const MAX_SPAWN = 25
const DIR: Record<Direction, Vec2> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }

/** The objects created by the last batch, so "move them" can find them. */
let lastBatch: string[] = []
export const getLastBatch = () => lastBatch.filter((id) => useWorld.getState().objects[id])

/** One undo step for a group of edits (history coalesces "drag" gestures). */
function batch<T>(fn: () => T): T {
  const w = useWorld.getState()
  const wasDragging = w.dragging
  if (!wasDragging) w.setDragging(true)
  try {
    return fn()
  } finally {
    if (!wasDragging) useWorld.getState().setDragging(false)
  }
}

/** Default object for a spec, centred at `at`. */
export function objectFor(spec: SpawnSpec, at: Vec2): Omit<WorldObject, 'id'> | null {
  const s = spec.scale ?? 1
  const hs = spec.heightScale ?? 1
  const sized = (size: Vec3): Vec3 => [size[0] * s, size[1] * s * hs, size[2] * s]
  if (spec.assetId) {
    if (!getAsset(spec.assetId)) return null
    return buildAsset(spec.assetId, at, 0, false)
  }
  switch (spec.kind) {
    case 'building': {
      const style = (spec.style && spec.style in BUILDING_STYLES ? spec.style : 'office') as BuildingStyle
      const def = BUILDING_STYLES[style]
      return { kind: 'building', position: [at[0], 0, at[1]], size: sized(def.size), rotationY: 0, color: def.color, style, roof: def.roof }
    }
    case 'tree':
      return { kind: 'tree', position: [at[0], 0, at[1]], size: sized(DECOR_DEFAULTS.tree.size), rotationY: 0, style: spec.style === 'pine' ? 'pine' : 'round' }
    case 'streetlight':
      return { kind: 'streetlight', position: [at[0], 0, at[1]], size: sized(DECOR_DEFAULTS.streetlight.size), rotationY: 0 }
    case 'crate':
      return { kind: 'crate', position: [at[0], 0, at[1]], size: sized(DECOR_DEFAULTS.crate.size), rotationY: 0, material: spec.material ?? 'wood', solid: true }
    case 'wall':
      return { kind: 'wall', position: [at[0], 0, at[1]], size: [8 * s, 3 * s * hs, 0.3], rotationY: 0, material: spec.material ?? 'concrete' }
    case 'platform': {
      const road = spec.material === 'asphalt'
      const base: Vec3 = road ? [16, 0.05, 4] : PLATFORM_DEFAULTS.size
      return { kind: 'platform', position: [at[0], 0, at[1]], size: [base[0] * s, base[1], base[2] * s], rotationY: 0, material: spec.material ?? 'concrete' }
    }
  }
}

/** Resolve a placement to a point on the map. */
export function anchorPoint(p: Placement = {}): Vec2 {
  const w = useWorld.getState()
  const selected = w.selectedId ? w.objects[w.selectedId] : null
  let at: Vec2
  switch (p.anchor) {
    case 'robot':
      at = [...w.robotStart]
      break
    case 'goal':
      at = w.goal ? [...w.goal] : [0, 0]
      break
    case 'center':
      at = [0, 0]
      break
    case 'selected':
    case 'auto':
    default:
      at = selected ? [selected.position[0], selected.position[2]] : [0, 0]
  }
  if (p.direction) {
    const [dx, dz] = DIR[p.direction]
    const d = p.distance ?? 10
    at = [at[0] + dx * d, at[1] + dz * d]
  }
  return clampPoint(at, 0)
}

const clampPoint = ([x, z]: Vec2, margin: number): Vec2 => {
  const m = Math.min(margin, WORLD.half)
  return [Math.max(-WORLD.half + m, Math.min(WORLD.half - m, x)), Math.max(-WORLD.half + m, Math.min(WORLD.half - m, z))]
}

/** Footprint padded by `gap` on every side, for spacing checks. */
const padded = (o: Pick<WorldObject, 'position' | 'size' | 'rotationY'>, gap: number) => ({
  position: o.position,
  size: [o.size[0] + gap * 2, o.size[1], o.size[2] + gap * 2] as Vec3,
  rotationY: o.rotationY,
})

/**
 * Is `o` a good spot? Inside the map, not on top of anything solid (or anything at all, for solids),
 * and a solid never lands on the robot or its goal.
 */
function fits(o: Omit<WorldObject, 'id'>, others: Pick<WorldObject, 'position' | 'size' | 'rotationY' | 'kind' | 'solid'>[], gap: number): boolean {
  const ex = o.size[0] / 2
  const ez = o.size[2] / 2
  if (Math.abs(o.position[0]) + ex > WORLD.half || Math.abs(o.position[2]) + ez > WORLD.half) return false
  const solid = blocksNavigation(o as WorldObject)
  const probe = padded(o, gap)
  for (const other of others) {
    // Decorations may sit on roads and plazas; anything solid needs clear ground.
    if (!solid && !blocksNavigation(other as WorldObject)) continue
    if (footprintsOverlap(probe, other)) return false
  }
  if (solid) {
    const w = useWorld.getState()
    const keepClear = [w.robotStart, w.goal].filter(Boolean) as Vec2[]
    for (const [x, z] of keepClear) {
      const spot = { position: [x, 0, z] as Vec3, size: [WORLD.robotRadius * 4, 1, WORLD.robotRadius * 4] as Vec3, rotationY: 0 }
      if (footprintsOverlap(probe, spot)) return false
    }
  }
  return true
}

/** Spiral of candidate centres around `center`, nearest first. */
function* spiral(center: Vec2, step: number, maxRadius: number): Generator<Vec2> {
  yield center
  for (let r = 1; r * step <= maxRadius; r++) {
    for (let i = -r; i <= r; i++) {
      yield [center[0] + i * step, center[1] - r * step]
      yield [center[0] + i * step, center[1] + r * step]
    }
    for (let j = -r + 1; j <= r - 1; j++) {
      yield [center[0] - r * step, center[1] + j * step]
      yield [center[0] + r * step, center[1] + j * step]
    }
  }
}

export interface SpawnResult {
  ids: string[]
  requested: number
}

/**
 * Create `count` objects near the placement, each on free ground, spaced apart, snapped to the grid.
 * Places as many as fit; the result says how many. The last one created is selected.
 */
export function spawnObjects(spec: SpawnSpec, count: number, placement: Placement = {}): SpawnResult {
  const requested = Math.max(1, Math.min(MAX_SPAWN, Math.round(count)))
  const sample = objectFor(spec, [0, 0])
  if (!sample) return { ids: [], requested }
  const center = anchorPoint(placement)
  const solid = blocksNavigation(sample as WorldObject)
  const gap = solid ? 2 : 0.6
  const step = Math.max(sample.size[0], sample.size[2]) + gap
  const others: Omit<WorldObject, 'id'>[] = Object.values(useWorld.getState().objects)
  const ids: string[] = []

  batch(() => {
    for (const c of spiral(center, Math.max(1, step / 2), WORLD.half * 2)) {
      if (ids.length >= requested) break
      const snapped = snapFootprint(c, sample.size[0], sample.size[2], 0)
      const o = objectFor(spec, snapped)
      if (!o || !fits(o, others, gap / 2)) continue
      ids.push(useWorld.getState().addObject(o))
      others.push(o)
    }
  })
  if (ids.length) {
    lastBatch = ids
    useWorld.getState().select(ids[ids.length - 1])
  }
  return { ids, requested }
}

/** Ids for "it" (the selection, else the last batch) or "them" (the last batch, else the selection). */
export function targetIds(which: 'selected' | 'last'): string[] {
  const w = useWorld.getState()
  const sel = w.selectedId && w.objects[w.selectedId] ? [w.selectedId] : []
  const last = getLastBatch()
  if (which === 'last') return last.length ? last : sel
  return sel.length ? sel : last.slice(-1)
}

/** Move objects by a direction and distance (metres), or next to a named spot. */
export function moveObjects(ids: string[], move: { direction?: Direction; distance?: number; to?: AnchorName }): number {
  const w = useWorld.getState()
  const objs = ids.map((id) => w.objects[id]).filter(Boolean)
  if (!objs.length) return 0
  let dx = 0
  let dz = 0
  if (move.to) {
    // Move the group so its centre lands next to the target spot (on free ground for the first one).
    const cx = objs.reduce((s, o) => s + o.position[0], 0) / objs.length
    const cz = objs.reduce((s, o) => s + o.position[2], 0) / objs.length
    const target = anchorPoint({ anchor: move.to })
    const others = Object.values(w.objects).filter((o) => !ids.includes(o.id))
    const first = objs[0]
    let dest: Vec2 = target
    for (const c of spiral(target, Math.max(1, Math.max(first.size[0], first.size[2]) / 2), WORLD.half)) {
      const probe = { ...first, position: [c[0], first.position[1], c[1]] as Vec3 }
      if (fits(probe, others, 0.5)) {
        dest = c
        break
      }
    }
    dx = dest[0] - (objs.length === 1 ? first.position[0] : cx)
    dz = dest[1] - (objs.length === 1 ? first.position[2] : cz)
  } else if (move.direction) {
    const [ux, uz] = DIR[move.direction]
    const d = move.distance ?? 5
    dx = ux * d
    dz = uz * d
  }
  batch(() => {
    for (const o of objs) {
      const [x, z] = clampPoint([o.position[0] + dx, o.position[2] + dz], Math.max(o.size[0], o.size[2]) / 2)
      useWorld.getState().updateObject(o.id, { position: [x, o.position[1], z] })
    }
  })
  return objs.length
}

/** Rotate each object about its own centre by `degrees` (snapped to 15°). */
export function rotateObjects(ids: string[], degrees: number): number {
  const w = useWorld.getState()
  let n = 0
  batch(() => {
    for (const id of ids) {
      const o = w.objects[id]
      if (!o) continue
      useWorld.getState().updateObject(id, { rotationY: snapAngle(o.rotationY + (degrees * Math.PI) / 180) })
      n++
    }
  })
  return n
}

/** Scale size: 'all' (footprint + height), 'height', or 'footprint'. */
export function resizeObjects(ids: string[], factor: number, axis: 'all' | 'height' | 'footprint' = 'all'): number {
  const f = Math.max(0.2, Math.min(5, factor))
  const w = useWorld.getState()
  let n = 0
  batch(() => {
    for (const id of ids) {
      const o = w.objects[id]
      if (!o) continue
      const xz = axis === 'height' ? 1 : f
      const y = axis === 'footprint' ? 1 : f
      const size: Vec3 = [snapSize(o.size[0] * xz, 0.1), Math.max(0.05, Math.min(80, o.size[1] * y)), snapSize(o.size[2] * xz, 0.1)]
      useWorld.getState().updateObject(id, { size })
      n++
    }
  })
  return n
}

/** Copies of an object placed on free ground around it. */
export function duplicateObjects(id: string, count: number): SpawnResult {
  const src = useWorld.getState().objects[id]
  if (!src) return { ids: [], requested: count }
  const requested = Math.max(1, Math.min(MAX_SPAWN, Math.round(count)))
  const solid = blocksNavigation(src)
  const gap = solid ? 2 : 0.6
  const step = Math.max(src.size[0], src.size[2]) + gap
  const others: Omit<WorldObject, 'id'>[] = Object.values(useWorld.getState().objects)
  const ids: string[] = []
  const { id: _id, ...base } = src
  batch(() => {
    for (const c of spiral([src.position[0], src.position[2]], Math.max(1, step / 2), WORLD.half * 2)) {
      if (ids.length >= requested) break
      const snapped = snapFootprint(c, src.size[0], src.size[2], src.rotationY)
      const o = { ...base, position: [snapped[0], src.position[1], snapped[1]] as Vec3, size: [...src.size] as Vec3 }
      if (!fits(o, others, gap / 2)) continue
      ids.push(useWorld.getState().addObject(o))
      others.push(o)
    }
  })
  if (ids.length) {
    lastBatch = ids
    useWorld.getState().select(ids[ids.length - 1])
  }
  return { ids, requested }
}
