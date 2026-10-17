import { idFor, type WorldSnapshot } from './store'
import type { BuildingStyle, MaterialId, ObjectKind, Vec3, WorldObject } from './types'
import { BUILDING_STYLES } from './catalog'
import { propFromCatalog } from './eventCatalog'

/**
 * Preset world layouts (objects + robot + goal). Appearance and brush defaults live in
 * `environment.ts`. Each builder returns fresh ids so loading twice never collides.
 */
type Extra = Partial<Omit<WorldObject, 'id' | 'kind' | 'position' | 'size'>>
const obj = (kind: ObjectKind, x: number, z: number, size: Vec3, extra: Extra = {}): WorldObject => ({
  id: idFor(kind),
  kind,
  position: [x, 0, z],
  size,
  rotationY: 0,
  ...extra,
})

const building = (style: BuildingStyle, x: number, z: number, w: number, h: number, d: number, extra: Extra = {}) =>
  obj('building', x, z, [w, h, d], { style, roof: BUILDING_STYLES[style].roof, color: BUILDING_STYLES[style].color, ...extra })
const road = (x: number, z: number, w: number, d: number) => obj('platform', x, z, [w, 0.03, d], { material: 'asphalt' })
const slab = (material: MaterialId, x: number, z: number, w: number, h: number, d: number, extra: Extra = {}) =>
  obj('platform', x, z, [w, h, d], { material, ...extra })
const wall = (material: MaterialId, x: number, z: number, length: number, height: number, rotationY = 0, extra: Extra = {}) =>
  obj('wall', x, z, [length, height, 0.3], { material, rotationY, ...extra })
const tree = (x: number, z: number, style: 'round' | 'pine' = 'round', s = 1) => obj('tree', x, z, [1.2 * s, 2.4 * s, 1.2 * s], { style })
const lamp = (x: number, z: number, rotationY = 0) => obj('streetlight', x, z, [0.4, 2.6, 0.4], { rotationY })
const crate = (x: number, z: number, material: MaterialId = 'wood', s = 0.8, solid = true) =>
  obj('crate', x, z, [s, s, s], { material, solid })

/**
 * "Forge District": a miniature futuristic city. Downtown towers (north-west), an industrial yard
 * with the goal (north-east), a residential block (south-east) and an open plaza where the
 * robot starts (south-west). Roads and plazas are walkable; buildings, walls, the loading dock
 * and the crates block navigation.
 */
export function forgeDistrict(): WorldSnapshot {
  const objects: WorldObject[] = [
    road(0, 1, 20, 1.6),
    road(-1, -4.9, 1.6, 10.2),
    road(-1, 5.9, 1.6, 8.2),
    road(5.25, -4.4, 1.4, 9.2),
    road(5.25, 6, 8.5, 1.2),

    slab('concrete', -6, 5.5, 7, 0.06, 6),
    wall('brick', -6, 9.2, 6, 0.8),
    tree(-9, 3, 'round'),
    tree(-3.2, 3.1, 'round', 0.9),
    tree(-9, 8, 'pine'),
    tree(-3.2, 8, 'pine', 1.1),

    building('tower', -7.5, -7.5, 2.5, 7, 2.5),
    building('tower', -4, -7.5, 2.5, 5.5, 2.5, { color: '#a7c4dc' }),
    building('office', -7.5, -3.25, 3, 3.5, 2.5),
    building('tower', -4, -3.5, 2, 4.5, 2, { color: '#c6d3e2' }),
    lamp(-8, 2.1),
    lamp(-4, 2.1),
    lamp(-6, -0.1, Math.PI),
    lamp(-2.5, -0.1, Math.PI),
    tree(-9.3, -0.8, 'pine', 0.8),

    building('industrial', 2.75, -3, 3.5, 2.5, 3),
    building('industrial', 2.75, -7.5, 3.5, 2.8, 3.5, { color: '#b5a99a' }),
    slab('metal', 2.75, -5.3, 2.5, 0.5, 0.8),
    wall('metal', 8.25, -9.5, 3.5, 1.4),
    wall('metal', 6.5, -7.75, 3.5, 1.4, Math.PI / 2),
    wall('metal', 8.25, -3.5, 3.5, 1.4),
    crate(8.6, -5, 'metal'),
    crate(9.4, -5, 'metal'),
    crate(9.4, -5.8, 'wood'),
    crate(7.6, -8.7, 'wood'),
    crate(8.4, -8.7, 'wood', 0.6),
    crate(4.2, -0.6, 'wood', 0.6),
    lamp(3, 2.1),
    lamp(7, 2.1),
    lamp(1, -0.1, Math.PI),
    lamp(9, -0.1, Math.PI),

    building('house', 2.5, 4, 2.5, 2, 2.5),
    building('house', 6, 4, 2.5, 2.2, 3, { color: '#d9c7a8' }),
    building('house', 2.5, 8, 2.5, 2, 2.5, { rotationY: Math.PI, color: '#e8dcc4' }),
    building('office', 6, 8, 2.5, 2.5, 2.5, { color: '#cfd8d0' }),
    slab('grass', 8.75, 8.25, 2.4, 0.05, 3),
    tree(8.6, 7.5, 'round'),
    tree(9.2, 9.1, 'round', 0.8),
    tree(8.8, 3, 'pine'),
    tree(8.8, 4.8, 'round', 0.9),
    tree(0.6, 9.3, 'round', 0.8),
  ]
  return { objects, robotStart: [-6, 5.5], goal: [8.6, -7] }
}

/**
 * Mars Outpost: habitats and solar arrays on red ground. A concrete spine connects the
 * landing pad (robot start) to the communications tower (goal). Rocks block; solar decks don't.
 */
export function marsOutpost(): WorldSnapshot {
  const marsHab = '#c4785a'
  const marsHab2 = '#a86848'
  const objects: WorldObject[] = [
    // Traversable spine and landing pad.
    slab('concrete', -6, 6, 5, 0.05, 5),
    slab('concrete', -2, 6, 4, 0.04, 1.4),
    slab('concrete', 0, 2, 1.5, 0.04, 8),
    slab('concrete', 0, -4, 1.5, 0.04, 6),
    slab('concrete', 3, -7, 6, 0.04, 1.5),
    slab('concrete', 7, -7, 3, 0.05, 3),

    // Research habitats (blocking).
    building('industrial', -7.5, 2.5, 3.2, 2.2, 3.2, { color: marsHab }),
    building('industrial', -3.5, 2.5, 2.8, 1.8, 2.8, { color: marsHab2 }),
    building('office', 4, 4, 3, 2, 2.5, { color: '#b8956a', roof: 'flat' }),
    building('industrial', 7, 1, 2.5, 2.4, 3, { color: marsHab }),

    // Solar arrays — low walkable platforms (not blocking).
    slab('metal', -8, -2, 3.5, 0.08, 2.2, { color: '#6a8a9a' }),
    slab('metal', -8, -5, 3.5, 0.08, 2.2, { color: '#6a8a9a' }),
    slab('metal', 5, 7, 4, 0.08, 2, { color: '#5a7a8a' }),
    wall('metal', -8, -3.5, 3.2, 0.6, 0, { color: '#4a6a7a' }),
    wall('metal', 5, 5.8, 3.6, 0.55, 0, { color: '#4a6a7a' }),

    // Communications tower + equipment pad (goal nearby).
    building('tower', 7.5, -4, 1.4, 6.5, 1.4, { color: '#9aa8b0', roof: 'flat' }),
    wall('metal', 7.5, -5.6, 2.2, 1.2),
    crate(8.6, -5.2, 'metal', 0.7),
    crate(6.4, -8.4, 'metal', 0.6),

    // Rock formations (solid crates) off the path.
    crate(-9, -8, 'metal', 1.2),
    crate(-8.2, -8.8, 'wood', 0.9),
    crate(-9.2, -7.2, 'metal', 0.7),
    crate(9, 8, 'metal', 1.1),
    crate(8.2, 7.2, 'wood', 0.8),
    crate(3, -2, 'metal', 0.9),
    crate(-4, -7, 'wood', 1.0),
    crate(8.5, 3.5, 'metal', 0.75),

    // Marker lights (non-blocking).
    lamp(-6, 4.2),
    lamp(-2, 6.8),
    lamp(0, 0),
    lamp(7, -8.5),
  ]
  return { objects, robotStart: [-6, 6], goal: [7, -7] }
}

/**
 * Autonomous Warehouse: racks, loading bay, cargo. Centre aisle stays clear for the robot
 * from the south staging area to the north loading dock.
 */
export function warehouse(): WorldSnapshot {
  const objects: WorldObject[] = [
    // Floor plate + centre aisle + cross aisles (walkable).
    slab('concrete', 0, 0, 18, 0.04, 18),
    road(0, 0, 2.2, 18),
    road(0, 0, 18, 2.0),
    road(0, 6, 18, 1.6),
    road(0, -6, 18, 1.6),

    // West storage racks (blocking industrial bays).
    building('industrial', -6, 8, 4, 3.2, 2.2, { color: '#8a96a0' }),
    building('industrial', -6, 4, 4, 3.5, 2.2, { color: '#7a8690' }),
    building('industrial', -6, -4, 4, 3.2, 2.2, { color: '#8a96a0' }),
    building('industrial', -6, -8, 4, 3.4, 2.2, { color: '#7a8690' }),

    // East storage racks.
    building('industrial', 6, 8, 4, 3.3, 2.2, { color: '#8a96a0' }),
    building('industrial', 6, 4, 4, 3.6, 2.2, { color: '#7a8690' }),
    building('industrial', 6, -4, 4, 3.3, 2.2, { color: '#8a96a0' }),
    building('industrial', 6, -8, 4, 3.5, 2.2, { color: '#7a8690' }),

    // Loading dock (north) — raised metal pad, short enough to stay walkable? height 0.25 < STEP 0.3
    slab('metal', 0, -8.5, 5, 0.2, 2.5),
    wall('metal', -3.2, -8.5, 2.4, 1.6, Math.PI / 2),
    wall('metal', 3.2, -8.5, 2.4, 1.6, Math.PI / 2),

    // Workstations (south corners) — small offices, leave centre clear.
    building('office', -7.5, 0, 2.2, 2, 2.2, { color: '#b0b8c0', roof: 'flat' }),
    building('office', 7.5, 0, 2.2, 2, 2.2, { color: '#b0b8c0', roof: 'flat' }),

    // Cargo crates in bays (blocking) — keep clear of centre aisle (x≈0) and cross aisle (z≈0).
    crate(-6, 6.2, 'wood', 0.9),
    crate(-5.2, 6.2, 'wood', 0.8),
    crate(-6.5, 2.2, 'metal', 0.9),
    crate(-5.5, -2.2, 'wood', 0.85),
    crate(-6, -6.2, 'metal', 0.9),
    crate(6, 6.2, 'metal', 0.9),
    crate(5.2, 6.2, 'wood', 0.8),
    crate(6.5, 2.2, 'wood', 0.9),
    crate(5.5, -2.2, 'metal', 0.85),
    crate(6, -6.2, 'wood', 0.9),
    crate(-8.5, 8.5, 'wood', 0.7),
    crate(8.5, -3.5, 'metal', 0.7),

    // Aisle lights (non-blocking).
    lamp(-1.4, 8),
    lamp(1.4, 8),
    lamp(-1.4, 0, Math.PI),
    lamp(1.4, 0, Math.PI),
    lamp(-1.4, -8),
    lamp(1.4, -8),
  ]
  return { objects, robotStart: [0, 8], goal: [0, -8.2] }
}

const prop = (catalogId: string, x: number, z: number, rotationY = 0): WorldObject => {
  const base = propFromCatalog(catalogId, [x, 0, z], rotationY)
  if (!base) throw new Error(`Unknown event catalog id: ${catalogId}`)
  return { id: idFor('prop'), ...base }
}

/**
 * Empty Event Venue — mostly empty rectangular interior (~18×14 m inside a 20×20 map)
 * with perimeter walls, a main entrance (south), and two exits (north + east).
 * Interior is clear so users can design job fairs and other events.
 */
export function emptyEventVenue(): WorldSnapshot {
  const wallH = 2.4
  const thick = 0.35
  // Interior roughly x∈[-9,9], z∈[-7,7]; openings punched as gaps in walls.
  const objects: WorldObject[] = [
    // Floor slab (walkable)
    slab('concrete', 0, 0, 18.2, 0.04, 14.2),

    // North wall with centre exit gap (±1.2)
    wall('concrete', -5.1, -7, 7.6, wallH, 0, { solid: true }),
    wall('concrete', 5.1, -7, 7.6, wallH, 0, { solid: true }),
    // South wall with main entrance gap
    wall('concrete', -5.1, 7, 7.6, wallH, 0, { solid: true }),
    wall('concrete', 5.1, 7, 7.6, wallH, 0, { solid: true }),
    // West wall solid
    wall('concrete', -9, 0, 14, wallH, Math.PI / 2, { solid: true }),
    // East wall with loading / emergency exit gap near z=0
    wall('concrete', 9, -3.8, 6.2, wallH, Math.PI / 2, { solid: true }),
    wall('concrete', 9, 3.8, 6.2, wallH, Math.PI / 2, { solid: true }),

    // Corner posts for readability
    wall('metal', -9, -7, 0.5, wallH + 0.2, 0, { solid: true }),
    wall('metal', 9, -7, 0.5, wallH + 0.2, 0, { solid: true }),
    wall('metal', -9, 7, 0.5, wallH + 0.2, 0, { solid: true }),
    wall('metal', 9, 7, 0.5, wallH + 0.2, 0, { solid: true }),

    prop('entrance-marker', 0, 7.6),
    prop('exit-marker', 0, -7.6),
    prop('exit-marker', 9.4, 0),
    prop('directional-sign', -1.6, 6.2),
    prop('directional-sign', 1.6, 6.2, Math.PI),
  ]
  // Robot / attendee start at main entrance; goal unused for events (attendee sim uses roles).
  return { objects, robotStart: [0, 7.4], goal: null }
}

/**
 * Job Fair template — built from catalog props so every object stays editable.
 * Layout: registration near entrance, four employer booths, seating, small stage, queue.
 */
export function jobFair(): WorldSnapshot {
  const base = emptyEventVenue()
  const extras: WorldObject[] = [
    prop('registration-desk', 0, 5.2),
    prop('queue-barrier', -1.4, 5.9, Math.PI / 2),
    prop('queue-barrier', 1.4, 5.9, Math.PI / 2),
    prop('directional-sign', 0, 4.2),

    // Employer booths along the sides
    prop('exhibition-booth', -5.5, 1.5, Math.PI / 2),
    prop('booth-wall', -5.5, -0.2, Math.PI / 2),
    prop('exhibition-booth', -5.5, -3.2, Math.PI / 2),
    prop('exhibition-booth', 5.5, 1.5, -Math.PI / 2),
    prop('booth-wall', 5.5, -0.2, -Math.PI / 2),
    prop('exhibition-booth', 5.5, -3.2, -Math.PI / 2),

    // Seating cluster
    prop('table-rect-m', -1.5, -1),
    prop('chair-folding', -1.5, -0.1),
    prop('chair-folding', -1.5, -1.9, Math.PI),
    prop('table-rect-m', 1.5, -1),
    prop('chair-folding', 1.5, -0.1),
    prop('chair-folding', 1.5, -1.9, Math.PI),

    // Stage + backdrop at north
    prop('stage', 0, -5.2),
    prop('backdrop', 0, -6.5),
    prop('mic-stand', 0, -4.4),
    prop('speaker', -2.8, -5.2),
    prop('speaker', 2.8, -5.2),

    prop('cocktail-table', 3.5, 3.5),
    prop('cocktail-table', -3.5, 3.5),
  ]
  return {
    objects: [...base.objects, ...extras],
    robotStart: [0, 7.4],
    goal: null,
  }
}

/** Desktop inspector list — ids match `EnvironmentId` / `loadEnvironment`. */
export const PRESETS = [
  { id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict },
  { id: 'mars-outpost', label: 'Mars Outpost', build: marsOutpost },
  { id: 'warehouse', label: 'Autonomous Warehouse', build: warehouse },
  { id: 'empty-event-venue', label: 'Empty Event Venue', build: emptyEventVenue },
  { id: 'job-fair', label: 'Job Fair', build: jobFair },
] as const
