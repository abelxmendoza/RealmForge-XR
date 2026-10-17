import { idFor, type WorldSnapshot } from './store'
import type { BuildingStyle, MaterialId, ObjectKind, PalletStyle, RackStyle, Vec3, WorldObject } from './types'
import { BUILDING_STYLES } from './catalog'
import { PALLET, RACK } from './scale'

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
/** Real-size EUR pallet (1.2 × 1.0 m); height follows the load. */
const pallet = (x: number, z: number, style: PalletStyle = 'boxes', rotationY = 0) =>
  obj('pallet', x, z, [PALLET.width, PALLET.heightFor[style], PALLET.depth], { style, rotationY })
/** A run of `bays` racking bays (2.7 m each) along x, `h` metres tall (a beam level every 1.5 m). */
const rack = (x: number, z: number, bays: number, h = 6, style: RackStyle = 'loaded', rotationY = 0) =>
  obj('rack', x, z, [bays * RACK.bay, h, RACK.depth], { style, rotationY })

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
 * Mars Outpost at real size: habitats and solar arrays on red ground. A concrete spine connects the
 * landing pad (robot start) to the communications tower (goal). Rocks block; solar decks don't.
 */
export function marsOutpost(): WorldSnapshot {
  const marsHab = '#c4785a'
  const marsHab2 = '#a86848'
  const objects: WorldObject[] = [
    // Traversable spine and landing pad.
    slab('concrete', -24, 24, 20, 0.15, 20),
    slab('concrete', -8, 24, 16, 0.12, 5.6),
    slab('concrete', 0, 8, 6, 0.12, 32),
    slab('concrete', 0, -16, 6, 0.12, 24),
    slab('concrete', 12, -28, 24, 0.12, 6),
    slab('concrete', 28, -28, 12, 0.15, 12),

    // Research habitats (blocking): two-bay modules and a two-storey lab.
    building('industrial', -30, 10, 12.8, 9, 12.8, { color: marsHab }),
    building('industrial', -14, 10, 11.2, 9, 11.2, { color: marsHab2 }),
    building('office', 16, 16, 12, 6, 10, { color: '#b8956a', roof: 'flat' }),
    building('industrial', 28, 4, 10, 9, 12, { color: marsHab }),

    // Solar arrays: low walkable decks (not blocking) with panel backs.
    slab('metal', -32, -8, 14, 0.2, 8.8, { color: '#6a8a9a' }),
    slab('metal', -32, -20, 14, 0.2, 8.8, { color: '#6a8a9a' }),
    slab('metal', 20, 28, 16, 0.2, 8, { color: '#5a7a8a' }),
    wall('metal', -32, -14, 12.8, 1.5, 0, { color: '#4a6a7a' }),
    wall('metal', 20, 23.2, 14.4, 1.4, 0, { color: '#4a6a7a' }),

    // Communications tower + equipment pad (goal nearby).
    building('tower', 30, -16, 5.6, 27, 5.6, { color: '#9aa8b0', roof: 'flat' }),
    wall('metal', 30, -22.4, 8.8, 2.5),
    crate(34.4, -20.8, 'metal', 1.4),
    crate(25.6, -33.6, 'metal', 1.2),

    // Rock formations (solid crates) off the path.
    crate(-36, -32, 'metal', 2.4),
    crate(-32.8, -35.2, 'wood', 1.8),
    crate(-36.8, -28.8, 'metal', 1.4),
    crate(36, 32, 'metal', 2.2),
    crate(32.8, 28.8, 'wood', 1.6),
    crate(12, -8, 'metal', 1.8),
    crate(-16, -28, 'wood', 2),
    crate(34, 14, 'metal', 1.5),

    // Marker lights (non-blocking).
    lamp(-24, 16.8),
    lamp(-8, 27.2),
    lamp(3.6, 0),
    lamp(28, -34),
  ]
  return { objects, robotStart: [-24, 24], goal: [28, -28] }
}

/**
 * Autonomous Warehouse at real size (a 56 × 52 m hall): back-to-back pallet racking in three pairs of
 * rows with 5 m forklift aisles, a 4 m central cross aisle, a pallet staging area by the south yard, a
 * raised loading dock on the north wall and offices in the south corners. The robot runs from staging
 * to the dock down the central aisle.
 */
export function warehouse(): WorldSnapshot {
  const objects: WorldObject[] = [
    // Hall floor (walkable) and the central aisle (asphalt with a centre line).
    slab('concrete', 0, 0, 56, 0.08, 52),
    road(0, -2, 4, 40),

    // Perimeter: side walls and the north wall with a 12 m dock opening.
    wall('metal', -28, 0, 52, 8, Math.PI / 2),
    wall('metal', 28, 0, 52, 8, Math.PI / 2),
    wall('metal', -17, -26, 22, 8),
    wall('metal', 17, -26, 22, 8),

    // Racking: three back-to-back pairs per side (6 bays = 16.2 m each, 6 m tall, 4 levels).
    ...[-15, -7.5, 0].flatMap((z, i) => [
      rack(-12.6, z - 0.6, 6, 6, 'loaded'),
      rack(-12.6, z + 0.6, 6, 6, i === 1 ? 'empty' : 'loaded'),
      rack(12.6, z - 0.6, 6, 6, 'loaded'),
      rack(12.6, z + 0.6, 6, 6, i === 2 ? 'empty' : 'loaded'),
    ]),

    // Loading dock: raised pad in the north opening (blocks), with bumpers.
    slab('metal', 0, -24, 12, 1.2, 3.6),
    wall('metal', -6.4, -23, 3.6, 1.4, Math.PI / 2),
    wall('metal', 6.4, -23, 3.6, 1.4, Math.PI / 2),

    // Staging area by the south yard: rows of loaded pallets either side of the aisle.
    ...[-10.4, -8.4, -6.4, -4.4].flatMap((x, i) => [
      pallet(x, 9.5, 'boxes'),
      pallet(x, 12, i % 2 ? 'wrapped' : 'boxes'),
      pallet(-x, 9.5, 'wrapped'),
      pallet(-x, 12, i % 2 ? 'boxes' : 'empty'),
    ]),
    pallet(-6.4, 14.5, 'empty'),
    pallet(6.4, 14.5, 'empty', Math.PI / 2),

    // Offices in the south corners (two storeys).
    building('office', -22, 20, 10, 6, 8, { color: '#b0b8c0', roof: 'flat' }),
    building('office', 22, 20, 10, 6, 8, { color: '#b0b8c0', roof: 'flat' }),

    // High-bay lights along the central aisle (non-blocking).
    lamp(-2.6, -18),
    lamp(2.6, -11, Math.PI),
    lamp(-2.6, -4),
    lamp(2.6, 3, Math.PI),
  ]
  return { objects, robotStart: [0, 16], goal: [0, -20] }
}

/** Desktop inspector list — ids match `EnvironmentId` / `loadEnvironment`. */
export const PRESETS = [
  { id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict },
  { id: 'mars-outpost', label: 'Mars Outpost', build: marsOutpost },
  { id: 'warehouse', label: 'Autonomous Warehouse', build: warehouse },
] as const
