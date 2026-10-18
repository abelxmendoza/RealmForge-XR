import { cloneActor, type Actor } from '../actors/types'
import { parseActors } from '../actors/serialization'
import type { FlowSnapshot, PlannedRoute, RouteMode, RouteStatus, TrafficZone, TrafficZoneType } from '../flow/types'
import { newId as newWorldId } from './store'
import { isAssetId, isDestinationRole } from './assetTypes'
import { WORLD, type ObjectKind, type Vec2, type Vec3, type WorldObject } from './types'
import { BUILDING_STYLES, PALLET_STYLES, PLATFORM_MATERIALS, RACK_STYLES, TREE_STYLES, WALL_MATERIALS } from './catalog'
import type { WorldSnapshot } from './store'
import type { EnvironmentId } from './environment'

/** Environment ids a world file may carry. Kept in step with ENVIRONMENTS by a test (importing it here would be circular). */
export const ENVIRONMENT_IDS_FOR_FILES: readonly EnvironmentId[] = [
  'forge-district',
  'mars-outpost',
  'warehouse',
  'empty-event-venue',
  'job-fair',
  'factory-floor',
  'music-festival',
]

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
  actors?: Actor[]
  environmentId?: EnvironmentId
  objects: WorldObject[]
  robotEnabled?: boolean
  robotStart: Vec2
  goal: Vec2 | null
  /** RealmForge Flow — planned routes (intent waypoints). Trajectories regenerate on load. */
  routes?: PlannedRoute[]
  /** RealmForge Flow — traffic control zones. */
  trafficZones?: TrafficZone[]
}

/** A validated world ready for store.loadWorld(), plus its name. */
export interface ParsedWorld extends WorldSnapshot {
  environmentId?: WorldFile['environmentId']
  name: string
  flow?: FlowSnapshot
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

const KINDS: ReadonlySet<ObjectKind> = new Set(['wall', 'building', 'platform', 'tree', 'streetlight', 'crate', 'pallet', 'rack', 'prop'])
const SIM_ROLES: ReadonlySet<string> = new Set([
  'decoration',
  'obstacle',
  'entrance',
  'exit',
  'registration',
  'booth',
  'service',
  'seating',
  'queue',
  'stage',
  'pickup',
  'delivery',
])
const MATERIALS: ReadonlySet<string> = new Set([...WALL_MATERIALS, ...PLATFORM_MATERIALS])
const STYLES: ReadonlySet<string> = new Set([...Object.keys(BUILDING_STYLES), ...TREE_STYLES, ...PALLET_STYLES, ...RACK_STYLES])
const ROOFS: ReadonlySet<string> = new Set(['flat', 'pitched'])
const ID_RE = /^[A-Za-z0-9_-]+$/
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

export const cleanName = (name: unknown, fallback = 'Untitled world') => {
  const s = typeof name === 'string' ? name.trim().slice(0, LIMITS.maxNameLength) : ''
  return s || fallback
}

/** Build the file for the current world. Only schema fields are written (no editor state, no secrets). */
export function serializeWorld(
  world: {
    objects: Record<string, WorldObject> | WorldObject[]
    robotEnabled?: boolean
    robotStart: Vec2
    goal: Vec2 | null
    actors?: Actor[] | Record<string, Actor>
    routes?: PlannedRoute[]
    trafficZones?: TrafficZone[]
  },
  name: string,
  now = new Date(),
): WorldFile {
  const list = Array.isArray(world.objects) ? world.objects : Object.values(world.objects)
  const actors = world.actors ? Object.values(world.actors) : []
  const routes = world.routes?.map(pickRoute)
  const trafficZones = world.trafficZones?.map(pickZone)
  return {
    format: WORLD_FORMAT,
    version: WORLD_VERSION,
    name: cleanName(name),
    savedAt: now.toISOString(),
    objects: list.map(pickObject),
    ...(actors.length ? { actors: actors.map(cloneActor) } : {}),
    ...(world.robotEnabled === false ? { robotEnabled: false } : {}),
    robotStart: [world.robotStart[0], world.robotStart[1]],
    goal: world.goal ? [world.goal[0], world.goal[1]] : null,
    ...(routes?.length ? { routes } : {}),
    ...(trafficZones?.length ? { trafficZones } : {}),
  }
}

function pickRoute(r: PlannedRoute): PlannedRoute {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    waypoints: r.waypoints.map((p) => [p[0], p[1]] as Vec2),
    assignedAgentIds: [...r.assignedAgentIds],
    status: r.status === 'draft' ? 'draft' : 'valid',
    trajectory: [],
    visible: r.visible !== false,
  }
}

function pickZone(z: TrafficZone): TrafficZone {
  const out: TrafficZone = {
    id: z.id,
    name: z.name,
    type: z.type,
    position: [...z.position],
    size: [...z.size],
    rotationY: z.rotationY,
  }
  if (z.direction) out.direction = [z.direction[0], z.direction[1]]
  if (z.speedLimit !== undefined) out.speedLimit = z.speedLimit
  if (z.restrictedAgents) out.restrictedAgents = [...z.restrictedAgents]
  return out
}

export const worldToJSON = (file: WorldFile) => JSON.stringify(file, null, 2)

/** Copy only the known schema fields, dropping undefined optionals. */
function pickObject(o: WorldObject): WorldObject {
  const out: WorldObject = { id: o.id, kind: o.kind, position: [...o.position], size: [...o.size], rotationY: o.rotationY }
  if (o.color !== undefined) out.color = o.color
  if (o.material !== undefined) out.material = o.material
  if (o.style !== undefined) out.style = o.style
  if (o.roof !== undefined) out.roof = o.roof
  if (o.assetId !== undefined) out.assetId = o.assetId
  if (o.destinationRole !== undefined) out.destinationRole = o.destinationRole
  if (o.solid !== undefined) out.solid = o.solid
  if (o.catalogId !== undefined) out.catalogId = o.catalogId
  if (o.simulationRole !== undefined) out.simulationRole = o.simulationRole
  if (o.capacity !== undefined) out.capacity = o.capacity
  if (o.serviceDuration !== undefined) out.serviceDuration = o.serviceDuration
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
  const parsedActors = parseActors(data.actors, seen, () => newWorldId('actor'))
  if (!parsedActors.ok) return parsedActors
  warnings.push(...parsedActors.warnings)
  const environmentId = typeof data.environmentId === 'string' && ENVIRONMENT_IDS_FOR_FILES.includes(data.environmentId as EnvironmentId)
    ? data.environmentId as WorldFile['environmentId'] : undefined
  const flow = parseFlow(data, warnings)
  return {
    ok: true,
    world: {
      name: cleanName(data.name),
      objects,
      robotStart,
      goal,
      ...(data.robotEnabled === false ? { robotEnabled: false } : {}),
      ...(parsedActors.actors.length ? { actors: parsedActors.actors } : {}),
      ...(environmentId ? { environmentId } : {}),
      ...(flow ? { flow } : {}),
    },
    warnings,
  }
}

const ROUTE_MODES: ReadonlySet<RouteMode> = new Set(['manual', 'waypoint', 'automatic'])
const ROUTE_STATUSES: ReadonlySet<RouteStatus> = new Set(['draft', 'valid', 'replanned', 'blocked', 'unreachable'])
const ZONE_TYPES: ReadonlySet<TrafficZoneType> = new Set(['one-way', 'restricted', 'slow', 'stop', 'queue', 'no-go'])

function parseFlow(data: Record<string, unknown>, warnings: string[]): FlowSnapshot | undefined {
  const routesIn = data.routes
  const zonesIn = data.trafficZones
  if (routesIn === undefined && zonesIn === undefined) return undefined
  const routes: PlannedRoute[] = []
  const trafficZones: TrafficZone[] = []
  const seen = new Set<string>()

  if (routesIn !== undefined) {
    if (!Array.isArray(routesIn)) {
      warnings.push('Ignored invalid "routes" (not an array).')
    } else {
      for (let i = 0; i < routesIn.length; i++) {
        const r = readRoute(routesIn[i], i, warnings)
        if (!r) continue
        if (seen.has(r.id)) {
          warnings.push(`Route ${i}: duplicate id "${r.id}" skipped.`)
          continue
        }
        seen.add(r.id)
        routes.push(r)
      }
    }
  }

  if (zonesIn !== undefined) {
    if (!Array.isArray(zonesIn)) {
      warnings.push('Ignored invalid "trafficZones" (not an array).')
    } else {
      for (let i = 0; i < zonesIn.length; i++) {
        const z = readZone(zonesIn[i], i, warnings)
        if (!z) continue
        if (seen.has(z.id)) {
          warnings.push(`Traffic zone ${i}: duplicate id "${z.id}" skipped.`)
          continue
        }
        seen.add(z.id)
        trafficZones.push(z)
      }
    }
  }

  return { routes, trafficZones }
}

function readRoute(v: unknown, i: number, warnings: string[]): PlannedRoute | null {
  if (!isObj(v)) {
    warnings.push(`Route ${i}: skipped (not an object).`)
    return null
  }
  if (typeof v.id !== 'string' || !ID_RE.test(v.id) || v.id.length > LIMITS.maxIdLength) {
    warnings.push(`Route ${i}: skipped (invalid id).`)
    return null
  }
  if (!Array.isArray(v.waypoints)) {
    warnings.push(`Route ${i}: skipped (waypoints missing).`)
    return null
  }
  const waypoints: Vec2[] = []
  for (const p of v.waypoints) {
    const pt = readPoint(p)
    if (pt) waypoints.push(pt)
  }
  const mode = typeof v.mode === 'string' && ROUTE_MODES.has(v.mode as RouteMode) ? (v.mode as RouteMode) : 'waypoint'
  const status =
    typeof v.status === 'string' && ROUTE_STATUSES.has(v.status as RouteStatus) ? (v.status as RouteStatus) : 'valid'
  const assigned = Array.isArray(v.assignedAgentIds)
    ? v.assignedAgentIds.filter((a): a is string => typeof a === 'string')
    : []
  return {
    id: v.id,
    name: cleanName(v.name, `Route ${i + 1}`),
    mode,
    waypoints,
    assignedAgentIds: assigned,
    status: status === 'draft' ? 'draft' : 'valid',
    trajectory: [],
    visible: v.visible !== false,
  }
}

function readZone(v: unknown, i: number, warnings: string[]): TrafficZone | null {
  if (!isObj(v)) {
    warnings.push(`Traffic zone ${i}: skipped (not an object).`)
    return null
  }
  if (typeof v.id !== 'string' || !ID_RE.test(v.id)) {
    warnings.push(`Traffic zone ${i}: skipped (invalid id).`)
    return null
  }
  if (typeof v.type !== 'string' || !ZONE_TYPES.has(v.type as TrafficZoneType)) {
    warnings.push(`Traffic zone ${i}: skipped (unknown type).`)
    return null
  }
  if (!Array.isArray(v.position) || v.position.length !== 3 || !v.position.every(finite)) {
    warnings.push(`Traffic zone ${i}: skipped (bad position).`)
    return null
  }
  if (!Array.isArray(v.size) || v.size.length !== 3 || !v.size.every(finite)) {
    warnings.push(`Traffic zone ${i}: skipped (bad size).`)
    return null
  }
  const zone: TrafficZone = {
    id: v.id,
    name: cleanName(v.name, `Zone ${i + 1}`),
    type: v.type as TrafficZoneType,
    position: [
      clamp(v.position[0] as number, -WORLD.half, WORLD.half),
      clamp(v.position[1] as number, 0, LIMITS.maxHeight),
      clamp(v.position[2] as number, -WORLD.half, WORLD.half),
    ],
    size: [
      clamp(v.size[0] as number, LIMITS.minSize, LIMITS.maxSize),
      clamp(v.size[1] as number, LIMITS.minSize, LIMITS.maxHeight),
      clamp(v.size[2] as number, LIMITS.minSize, LIMITS.maxSize),
    ],
    rotationY: finite(v.rotationY) ? (v.rotationY as number) : 0,
  }
  const dir = readPoint(v.direction)
  if (dir) zone.direction = dir
  if (finite(v.speedLimit)) zone.speedLimit = v.speedLimit as number
  return zone
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
  opt('assetId', isAssetId, (x) => (o.assetId = x as WorldObject['assetId']))
  opt('destinationRole', isDestinationRole, (x) => (o.destinationRole = x as WorldObject['destinationRole']))
  opt('solid', (x) => typeof x === 'boolean', (x) => (o.solid = x as boolean))
  opt(
    'catalogId',
    (x) => typeof x === 'string' && x.length > 0 && x.length <= 64 && ID_RE.test(x),
    (x) => (o.catalogId = x as string),
  )
  opt('simulationRole', (x) => typeof x === 'string' && SIM_ROLES.has(x), (x) => (o.simulationRole = x as WorldObject['simulationRole']))
  opt('capacity', (x) => finite(x) && (x as number) >= 0 && (x as number) <= 10_000, (x) => (o.capacity = x as number))
  opt(
    'serviceDuration',
    (x) => finite(x) && (x as number) >= 0 && (x as number) <= 600,
    (x) => (o.serviceDuration = x as number),
  )
  return o
}
