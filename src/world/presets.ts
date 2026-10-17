import { buildAsset } from './assets'
import type { AssetId } from './assetTypes'
import { idFor, type WorldSnapshot } from './store'
import type { BuildingStyle, MaterialId, ObjectKind, Vec3, WorldObject } from './types'
import { BUILDING_STYLES } from './catalog'

/**
 * Preset worlds. Each call returns fresh objects with new ids, so loading a preset twice
 * never collides with what is already in the store.
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
    slab('metal', 11, -21.2, 10, 0.20, 3.2),
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

export function marsOutpost(): WorldSnapshot {
  const marsHab = '#c4785a'
  const marsHab2 = '#a86848'
  const objects: WorldObject[] = [
    // Traversable spine and landing pad.
    slab('concrete', -24, 24, 20, 0.2, 20),
    slab('concrete', -8, 24, 16, 0.16, 5.6),
    slab('concrete', 0, 8, 6, 0.16, 32),
    slab('concrete', 0, -16, 6, 0.16, 24),
    slab('concrete', 12, -28, 24, 0.16, 6),
    slab('concrete', 28, -28, 12, 0.2, 12),

    // Research habitats (blocking).
    building('industrial', -30, 10, 12.8, 8.8, 12.8, { color: marsHab }),
    building('industrial', -14, 10, 11.2, 7.2, 11.2, { color: marsHab2 }),
    building('office', 16, 16, 12, 8, 10, { color: '#b8956a', roof: 'flat' }),
    building('industrial', 28, 4, 10, 9.6, 12, { color: marsHab }),

    // Solar arrays — low walkable platforms (not blocking).
    slab('metal', -32, -8, 14, 0.08, 8.8, { color: '#6a8a9a' }),
    slab('metal', -32, -20, 14, 0.08, 8.8, { color: '#6a8a9a' }),
    slab('metal', 20, 28, 16, 0.08, 8, { color: '#5a7a8a' }),
    wall('metal', -32, -14, 12.8, 2.4, 0, { color: '#4a6a7a' }),
    wall('metal', 20, 23.2, 14.4, 2.2, 0, { color: '#4a6a7a' }),

    // Communications tower + equipment pad (goal nearby).
    building('tower', 30, -16, 5.6, 26, 5.6, { color: '#9aa8b0', roof: 'flat' }),
    wall('metal', 30, -22.4, 8.8, 4.8),
    crate(34.4, -20.8, 'metal', 2.8),
    crate(25.6, -33.6, 'metal', 2.4),

    // Rock formations (solid crates) off the path.
    crate(-36, -32, 'metal', 4.8),
    crate(-32.8, -35.2, 'wood', 3.6),
    crate(-36.8, -28.8, 'metal', 2.8),
    crate(36, 32, 'metal', 4.4),
    crate(32.8, 28.8, 'wood', 3.2),
    crate(12, -8, 'metal', 3.6),
    crate(-16, -28, 'wood', 4),
    crate(34, 14, 'metal', 3),

    // Marker lights (non-blocking).
    lamp(-24, 16.8),
    lamp(-8, 27.2),
    lamp(0, 0),
    lamp(28, -34),
  ]
  return { objects, robotStart: [-24, 24], goal: [28, -28] }
}

/**
 * Autonomous Warehouse: racks, loading bay, cargo. Centre aisle stays clear for the robot
 * from the south staging area to the north loading dock.
 */

export function warehouse(): WorldSnapshot {
  const objects: WorldObject[] = [
    // Floor plate + centre aisle + cross aisles (walkable).
    slab('concrete', 0, 0, 72, 0.16, 72),
    slab('concrete', 0, 0, 8.8, 0.17, 72),
    slab('concrete', 0, 0, 72, 0.17, 8),
    slab('concrete', 0, 24, 72, 0.17, 6.4),
    slab('concrete', 0, -24, 72, 0.17, 6.4),

    // Cargo crates in bays (blocking) — keep clear of centre aisle (x≈0) and cross aisle (z≈0).
    crate(-24, 24.8, 'wood', 3.6),
    crate(-20.8, 24.8, 'wood', 3.2),
    crate(-26, 8.8, 'metal', 3.6),
    crate(-22, -8.8, 'wood', 3.4),
    crate(-24, -24.8, 'metal', 3.6),
    crate(24, 24.8, 'metal', 3.6),
    crate(20.8, 24.8, 'wood', 3.2),
    crate(26, 8.8, 'wood', 3.6),
    crate(22, -8.8, 'metal', 3.4),
    crate(24, -24.8, 'wood', 3.6),
    crate(-34, 34, 'wood', 2.8),
    crate(34, -14, 'metal', 2.8),
  ]
  // Real shelving instead of miniature exterior buildings; cross aisles stay open.
  for (const x of [-26, -16, 16, 26]) {
    for (const z of [-32, -16, 16, 32]) {
      const rack = buildAsset('storage-rack', [x, z], 0, false)!
      objects.push({ ...rack, id: idFor(rack.kind), size: [6, 7.5, 7], color: '#e49843' })
    }
  }
  // Catalog equipment and usable destination pads leave the central route clear.
  const equipment: [AssetId, number, number][] = [
    ['storage-rack', -10, -10], ['workstation', 10, 10], ['conveyor', 10, -10],
    ['cargo', -10, 10], ['barrier', -10, 5], ['loading-bay', 0, -34],
    ['pickup-zone', 0, 24], ['delivery-zone', 0, -24], ['charging-pad', 3, 32], ['inspection-point', 0, 0],
  ]
  for (const [id, x, z] of equipment) {
    const asset = buildAsset(id, [x, z], 0, false)!
    objects.push({ ...asset, id: idFor(asset.kind) })
  }
  return { objects, robotStart: [0, 32], goal: [0, -32.8] }
}

/** Empty has no authored content, agents, destinations or automatic routes. */
export function emptyEventVenue(): WorldSnapshot {
  return { objects: [], actors: [], robotEnabled: false, robotStart: [0, 0], goal: null }
}

/** Editable job-fair layout: registration, four employer booths, seating and presentation area. */
export function jobFair(): WorldSnapshot {
  const objects: WorldObject[] = []
  const desk = (x: number, z: number) => {
    const asset = buildAsset('workstation', [x, z], 0, false)!
    objects.push({ ...asset, id: idFor(asset.kind) })
  }
  objects.push(slab('concrete', 0, 0, 34, 0.05, 30))
  desk(0, 11) // registration
  for (const x of [-10, 10]) for (const z of [-4, 5]) {
    desk(x, z)
    objects.push(wall('metal', x, z - 2, 7, 2.4))
  }
  objects.push(slab('concrete', 0, -11, 12, 0.6, 5))
  objects.push(wall('metal', 0, -13, 12, 3))
  for (const x of [-3, 0, 3]) for (const z of [-4, -7]) {
    objects.push(obj('crate', x, z, [0.8, 0.5, 0.8], { color: '#65cdd0' }))
  }
  return { objects, actors: [], robotEnabled: false, robotStart: [0, 14], goal: null }
}

/** Desktop inspector list — ids match `EnvironmentId` / `loadEnvironment`. */
export const PRESETS = [
  { id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict },
  { id: 'mars-outpost', label: 'Mars Outpost', build: marsOutpost },
  { id: 'warehouse', label: 'Autonomous Warehouse', build: warehouse },
  { id: 'empty-event-venue', label: 'Empty', build: emptyEventVenue },
  { id: 'job-fair', label: 'Job Fair', build: jobFair },
] as const
