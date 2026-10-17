import { idFor, type WorldSnapshot } from './store'
import type { BuildingStyle, MaterialId, ObjectKind, Vec3, WorldObject } from './types'
import { BUILDING_STYLES } from './catalog'

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
const tree = (x: number, z: number, style: 'round' | 'pine' = 'round', s = 1) => obj('tree', x, z, [4 * s, 8 * s, 4 * s], { style })
const lamp = (x: number, z: number, rotationY = 0) => obj('streetlight', x, z, [0.4, 6, 0.4], { rotationY })
const crate = (x: number, z: number, material: MaterialId = 'wood', s = 1.2, solid = true) =>
  obj('crate', x, z, [s, s, s], { material, solid })

/**
 * "Forge District": a small futuristic city at real-world size (1 unit = 1 m; heights are whole
 * 3 m storeys). Downtown towers (north-west), an industrial yard with the goal (north-east), a
 * residential block (south-east) and an open plaza where the robot starts (south-west). Roads and
 * plazas are walkable; buildings, walls, the loading dock and the crates block navigation.
 */
export function forgeDistrict(): WorldSnapshot {
  const objects: WorldObject[] = [
    // Roads (6–7 m wide): main avenue (east–west), cross street split around the junction, industrial spur, side street.
    road(0, 4, 80, 6.4),
    road(-4, -19.6, 6.4, 40.8),
    road(-4, 23.6, 6.4, 32.8),
    road(21, -17.6, 5.6, 36.8),
    road(21, 24, 34, 4.8),

    // Plaza: the open area for agents.
    slab('concrete', -24, 22, 28, 0.15, 24),
    wall('brick', -24, 36.8, 24, 1.2),
    tree(-36, 12, 'round'),
    tree(-12.8, 12.4, 'round', 0.9),
    tree(-36, 32, 'pine'),
    tree(-12.8, 32, 'pine', 1.1),

    // Downtown towers.
    building('tower', -30, -30, 10, 27, 10),
    building('tower', -16, -30, 10, 21, 10, { color: '#a7c4dc' }),
    building('office', -30, -13, 12, 12, 10),
    building('tower', -16, -14, 8, 18, 8, { color: '#c6d3e2' }),
    lamp(-32, 8.4),
    lamp(-16, 8.4),
    lamp(-24, -0.4, Math.PI),
    lamp(-10, -0.4, Math.PI),
    tree(-37.2, -3.2, 'pine', 0.8),

    // Industrial district.
    building('industrial', 11, -12, 14, 9, 12),
    building('industrial', 11, -30, 14, 9, 14, { color: '#b5a99a' }),
    slab('metal', 11, -21.2, 10, 1.2, 3.2),
    // Fenced yard with a gate on its west side (z −24…−14); the goal sits inside.
    wall('metal', 33, -38, 14, 2.5),
    wall('metal', 26, -31, 14, 2.5, Math.PI / 2),
    wall('metal', 33, -14, 14, 2.5),
    crate(34.4, -20, 'metal'),
    crate(37.6, -20, 'metal'),
    crate(37.6, -23.2, 'wood'),
    crate(30.4, -34.8, 'wood'),
    crate(33.6, -34.8, 'wood', 0.9),
    crate(16.8, -2.4, 'wood', 0.9),
    lamp(12, 8.4),
    lamp(28, 8.4),
    lamp(4, -0.4, Math.PI),
    lamp(36, -0.4, Math.PI),

    // Residential block: two-storey houses and a small three-storey office.
    building('house', 10, 16, 9, 6, 8),
    building('house', 24, 16, 9, 6, 10, { color: '#d9c7a8' }),
    building('house', 10, 32, 9, 6, 8, { rotationY: Math.PI, color: '#e8dcc4' }),
    building('office', 24, 32, 10, 9, 10, { color: '#cfd8d0' }),
    slab('grass', 35, 33, 9.6, 0.1, 12),
    tree(34.4, 30, 'round'),
    tree(36.8, 36.4, 'round', 0.8),
    tree(35.2, 12, 'pine'),
    tree(35.2, 19.2, 'round', 0.9),
    tree(2.4, 37.2, 'round', 0.8),
  ]
  return { objects, robotStart: [-24, 22], goal: [34.4, -28] }
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

/** Desktop inspector list — ids match `EnvironmentId` / `loadEnvironment`. */
export const PRESETS = [
  { id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict },
  { id: 'mars-outpost', label: 'Mars Outpost', build: marsOutpost },
  { id: 'warehouse', label: 'Autonomous Warehouse', build: warehouse },
] as const
