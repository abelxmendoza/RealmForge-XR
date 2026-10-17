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
const wall = (material: MaterialId, x: number, z: number, length: number, height: number, rotationY = 0) =>
  obj('wall', x, z, [length, height, 0.3], { material, rotationY })
const tree = (x: number, z: number, style: 'round' | 'pine' = 'round', s = 1) => obj('tree', x, z, [4 * s, 8 * s, 4 * s], { style })
const lamp = (x: number, z: number, rotationY = 0) => obj('streetlight', x, z, [0.4, 6, 0.4], { rotationY })
const crate = (x: number, z: number, material: MaterialId = 'wood', s = 1.2) => obj('crate', x, z, [s, s, s], { material, solid: true })

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

export const PRESETS = [{ id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict }] as const
