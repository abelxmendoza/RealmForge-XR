import { WORLD, type ObjectKind, type Vec2, type Vec3, type WorldObject } from './types'
import { BUILDING_STYLES, PLATFORM_MATERIALS, TREE_STYLES, WALL_MATERIALS } from './catalog'
import type { WorldSnapshot } from './store'

/**
 * Versioned, portable JSON format for a whole world.
 *
 * {
 *   "format": "realmforge-world",
 *   "version": 1,
 *   "name": "My First World",
 *   "savedAt": "2026-10-17T19:30:00.000Z",
 *   "objects": [WorldObject, ...],      // exactly the shared schema in types.ts
 *   "robotStart": [x, z],               // map units, same as the store
 *   "goal": [x, z] | null
 * }
 *
 * Pure functions only (no storage, no DOM), so the XR menu, desktop UI and tests share them.
 */
export const WORLD_FORMAT = 'realmforge-world'
export const WORLD_VERSION = 1

export interface WorldFile {
  format: typeof WORLD_FORMAT
  version: typeof WORLD_VERSION
  name: string
  savedAt: string
  objects: WorldObject[]
  robotStart: Vec2
  goal: Vec2 | null
}

/** A validated world ready for store.loadWorld(), plus its name. */
export interface ParsedWorld extends WorldSnapshot {
  name: string
}

export type ParseResult = { ok: true; world: ParsedWorld; warnings: string[] } | { ok: false; error: string }

export const LIMITS = {
  maxObjects: 2000,
  maxNameLength: 80,
  maxIdLength: 64,
  minSize: 0.01,
  maxSize: WORLD.half * 4,
  maxHeight: 60,
} as const

const KINDS: ReadonlySet<ObjectKind> = new Set(['wall', 'building', 'platform', 'tree', 'streetlight', 'crate'])
const MATERIALS: ReadonlySet<string> = new Set([...WALL_MATERIALS, ...PLATFORM_MATERIALS])
const STYLES: ReadonlySet<string> = new Set([...Object.keys(BUILDING_STYLES), ...TREE_STYLES])
const ROOFS: ReadonlySet<string> = new Set(['flat', 'pitched'])
const ID_RE = /^[A-Za-z0-9_-]+$/
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

export const cleanName = (name: unknown, fallback = 'Untitled world') => {
  const s = typeof name === 'string' ? name.trim().slice(0, LIMITS.maxNameLength) : ''
  return s || fallback
}

/** Build the file for the current world. Only schema fields are written (no editor state, no secrets). */
export function serializeWorld(world: { objects: Record<string, WorldObject> | WorldObject[]; robotStart: Vec2; goal: Vec2 | null }, name: string, now = new Date()): WorldFile {
  const list = Array.isArray(world.objects) ? world.objects : Object.values(world.objects)
  return {
    format: WORLD_FORMAT,
    version: WORLD_VERSION,
    name: cleanName(name),
    savedAt: now.toISOString(),
    objects: list.map(pickObject),
    robotStart: [world.robotStart[0], world.robotStart[1]],
    goal: world.goal ? [world.goal[0], world.goal[1]] : null,
  }
}

export const worldToJSON = (file: WorldFile) => JSON.stringify(file, null, 2)

/** Copy only the known schema fields, dropping undefined optionals. */
function pickObject(o: WorldObject): WorldObject {
  const out: WorldObject = { id: o.id, kind: o.kind, position: [...o.position], size: [...o.size], rotationY: o.rotationY }
  if (o.color !== undefined) out.color = o.color
  if (o.material !== undefined) out.material = o.material
  if (o.style !== undefined) out.style = o.style
  if (o.roof !== undefined) out.roof = o.roof
  if (o.solid !== undefined) out.solid = o.solid
  return out
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Accepts [x, z] (our format) or [x, y, z]; returns a clamped [x, z] or null. */
function readPoint(v: unknown): Vec2 | null {
  if (!Array.isArray(v) || !v.every(finite)) return null
  const p: Vec2 | null = v.length === 2 ? [v[0], v[1]] : v.length === 3 ? [v[0], v[2]] : null
  return p && [clamp(p[0], -WORLD.half, WORLD.half), clamp(p[1], -WORLD.half, WORLD.half)]
}

/**
 * Validate a world file (string or already-parsed JSON).
 * Rejects anything structurally wrong; repairs small problems (out-of-range values,
 * unknown optional values, bad or duplicate ids) and reports each repair as a warning.
 * `newId(kind)` supplies replacement ids for invalid/duplicate ones.
 */
export function parseWorld(input: unknown, newId: (kind: ObjectKind) => string): ParseResult {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      return { ok: false, error: 'Not valid JSON.' }
    }
  }
  if (!isObj(data)) return { ok: false, error: 'Not a RealmForge world file.' }
  if (data.format !== WORLD_FORMAT) return { ok: false, error: 'Not a RealmForge world file (missing "format": "realmforge-world").' }
  if (data.version !== WORLD_VERSION)
    return { ok: false, error: `Unsupported world version ${String(data.version)}; this build reads version ${WORLD_VERSION}.` }
  if (!Array.isArray(data.objects)) return { ok: false, error: '"objects" must be an array.' }
  if (data.objects.length > LIMITS.maxObjects) return { ok: false, error: `Too many objects (${data.objects.length}; limit ${LIMITS.maxObjects}).` }

  const warnings: string[] = []
  const robotStart = readPoint(data.robotStart)
  if (!robotStart) return { ok: false, error: '"robotStart" must be [x, z] numbers.' }
  let goal: Vec2 | null = null
  if (data.goal !== null && data.goal !== undefined) {
    goal = readPoint(data.goal)
    if (!goal) return { ok: false, error: '"goal" must be [x, z] numbers or null.' }
  }

  const seen = new Set<string>()
  const objects: WorldObject[] = []
  for (let i = 0; i < data.objects.length; i++) {
    const r = readObject(data.objects[i], i, warnings)
    if (typeof r === 'string') return { ok: false, error: r }
    if (!ID_RE.test(r.id) || r.id.length > LIMITS.maxIdLength || seen.has(r.id)) {
      const fresh = newId(r.kind)
      warnings.push(`Object ${i}: ${seen.has(r.id) ? 'duplicate' : 'invalid'} id "${r.id.slice(0, 40)}" replaced with "${fresh}".`)
      r.id = fresh
    }
    seen.add(r.id)
    objects.push(r)
  }
  return { ok: true, world: { name: cleanName(data.name), objects, robotStart, goal }, warnings }
}

/** One object, or an error string when it can't be used at all. */
function readObject(v: unknown, i: number, warnings: string[]): WorldObject | string {
  const at = `Object ${i}`
  if (!isObj(v)) return `${at} is not an object.`
  if (typeof v.kind !== 'string' || !KINDS.has(v.kind as ObjectKind)) return `${at} has unknown kind ${JSON.stringify(v.kind)}.`
  const kind = v.kind as ObjectKind
  if (!Array.isArray(v.position) || v.position.length !== 3 || !v.position.every(finite)) return `${at} needs "position": [x, y, z] numbers.`
  if (!Array.isArray(v.size) || v.size.length !== 3 || !v.size.every(finite)) return `${at} needs "size": [w, h, d] numbers.`
  if (v.size.some((s: number) => s <= 0)) return `${at} has a size that is zero or negative.`

  const [px, py, pz] = v.position as number[]
  const position: Vec3 = [clamp(px, -WORLD.half, WORLD.half), clamp(py, 0, LIMITS.maxHeight), clamp(pz, -WORLD.half, WORLD.half)]
  if (position[0] !== px || position[1] !== py || position[2] !== pz) warnings.push(`${at}: position moved inside the map.`)
  const [sw, sh, sd] = v.size as number[]
  const size: Vec3 = [clamp(sw, LIMITS.minSize, LIMITS.maxSize), clamp(sh, LIMITS.minSize, LIMITS.maxHeight), clamp(sd, LIMITS.minSize, LIMITS.maxSize)]
  if (size[0] !== sw || size[1] !== sh || size[2] !== sd) warnings.push(`${at}: size clamped to the allowed range.`)

  const o: WorldObject = {
    id: typeof v.id === 'string' ? v.id : '',
    kind,
    position,
    size,
    rotationY: finite(v.rotationY) ? v.rotationY % (Math.PI * 2) : 0,
  }
  if (v.rotationY !== undefined && !finite(v.rotationY)) warnings.push(`${at}: invalid rotation reset to 0.`)
  const opt = (key: keyof WorldObject, ok: (x: unknown) => boolean, set: (x: unknown) => void) => {
    if (v[key] === undefined) return
    if (ok(v[key])) set(v[key])
    else warnings.push(`${at}: ignored invalid ${key} ${JSON.stringify(v[key]).slice(0, 40)}.`)
  }
  opt('color', (x) => typeof x === 'string' && COLOR_RE.test(x), (x) => (o.color = x as string))
  opt('material', (x) => typeof x === 'string' && MATERIALS.has(x), (x) => (o.material = x as WorldObject['material']))
  opt('style', (x) => typeof x === 'string' && STYLES.has(x), (x) => (o.style = x as WorldObject['style']))
  opt('roof', (x) => typeof x === 'string' && ROOFS.has(x), (x) => (o.roof = x as WorldObject['roof']))
  opt('solid', (x) => typeof x === 'boolean', (x) => (o.solid = x as boolean))
  return o
}
