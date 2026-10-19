import { useWorld } from './store'
import { BUILDING_STYLES, CRATE_MATERIALS, PLATFORM_MATERIALS, WALL_MATERIALS } from './catalog'
import { snapSize } from './snap'
import { oneUndoStep } from './spawn'
import { WORLD, type BuildingStyle, type MaterialId, type RoofType, type Vec3, type WorldObject } from './types'

/**
 * Change what existing objects look like and how big they are, by name rather than by handle:
 * "make the houses brick", "pitched roofs", "make the road 20 meters long", "remove the trees".
 * Each call is one undo step. Unsupported changes for a kind are skipped, not errors.
 */

export type SizeAxis = 'all' | 'height' | 'footprint' | 'length' | 'width'

export interface ObjectPatch {
  material?: MaterialId
  /** Building style ("tower") or tree style ("pine"). */
  style?: string
  roof?: RoofType
  color?: string
  solid?: boolean
}

/** Buildings are drawn from `color`, so "brick" / "glass" on a building picks a matching colour. */
export const BUILDING_FINISH: Partial<Record<MaterialId, string>> = {
  brick: '#b0583f',
  glass: '#b9cde0',
  wood: '#a27a52',
  concrete: '#c9c4b8',
  metal: '#9aa4ad',
}

/** Index of the longer horizontal axis (0 = local x, 2 = local z): a road's length. */
const longAxis = (o: Pick<WorldObject, 'size'>) => (o.size[0] >= o.size[2] ? 0 : 2)

/** The patch fields that make sense for this object (and the extras they imply). */
function patchFor(o: WorldObject, p: ObjectPatch): Partial<WorldObject> | null {
  const out: Partial<WorldObject> = {}
  if (p.material) {
    if (o.kind === 'building') {
      if (BUILDING_FINISH[p.material]) out.color = BUILDING_FINISH[p.material]
    } else if (o.kind === 'wall' && WALL_MATERIALS.includes(p.material)) out.material = p.material
    else if (o.kind === 'platform' && PLATFORM_MATERIALS.includes(p.material)) out.material = p.material
    else if (o.kind === 'crate' && CRATE_MATERIALS.includes(p.material)) out.material = p.material
  }
  if (p.style) {
    if (o.kind === 'building' && p.style in BUILDING_STYLES) {
      const def = BUILDING_STYLES[p.style as BuildingStyle]
      // A new style gets that style's proportions, so "make it a tower" really is tall.
      Object.assign(out, { style: p.style, roof: def.roof, color: out.color ?? def.color, size: [...def.size] as Vec3 })
    } else if (o.kind === 'tree' && (p.style === 'pine' || p.style === 'round')) out.style = p.style
  }
  if (p.roof && o.kind === 'building') out.roof = p.roof
  if (p.color) out.color = p.color
  if (p.solid !== undefined) out.solid = p.solid
  return Object.keys(out).length ? out : null
}

/** Apply a look/behaviour patch. Returns how many objects changed. */
export function editObjects(ids: string[], patch: ObjectPatch): number {
  let n = 0
  oneUndoStep(() => {
    for (const id of ids) {
      const o = useWorld.getState().objects[id]
      if (!o) continue
      const change = patchFor(o, patch)
      if (!change) continue
      useWorld.getState().updateObject(id, change)
      n++
    }
  })
  return n
}

const clampSize = (v: number, max: number) => Math.max(0.3, Math.min(max, v))

/**
 * Resize by a factor or to an exact size in metres. `length` / `width` follow the object's own
 * long and short sides, so "make the road longer" stretches it along the road.
 */
export function sizeObjects(ids: string[], axis: SizeAxis, change: { factor?: number; metres?: number }): number {
  let n = 0
  oneUndoStep(() => {
    for (const id of ids) {
      const o = useWorld.getState().objects[id]
      if (!o) continue
      const size: Vec3 = [...o.size]
      const scale = (i: number, max: number) => {
        const next = change.metres ?? size[i] * (change.factor ?? 1)
        size[i] = i === 1 ? Math.max(0.05, Math.min(80, next)) : snapSize(clampSize(next, max), 0.1)
      }
      const long = longAxis(o)
      const short = long === 0 ? 2 : 0
      const span = WORLD.half * 2
      if (axis === 'height' || axis === 'all') scale(1, 80)
      if (axis === 'length' || axis === 'footprint' || axis === 'all') scale(long, span)
      if (axis === 'width' || axis === 'footprint' || axis === 'all') scale(short, span)
      useWorld.getState().updateObject(id, { size })
      n++
    }
  })
  return n
}

/** Delete objects and actors in one undo step. */
export function deleteThings(objectIds: string[], actorIds: string[] = []): number {
  let n = 0
  oneUndoStep(() => {
    const w = useWorld.getState()
    for (const id of objectIds) if (w.objects[id]) (useWorld.getState().removeObject(id), n++)
    for (const id of actorIds) if (useWorld.getState().actors[id]) (useWorld.getState().removeActor(id), n++)
    if (objectIds.includes(useWorld.getState().selectedId ?? '')) useWorld.getState().select(null)
  })
  return n
}
