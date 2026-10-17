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
const tree = (x: number, z: number, style: 'round' | 'pine' = 'round', s = 1) => obj('tree', x, z, [1.2 * s, 2.4 * s, 1.2 * s], { style })
const lamp = (x: number, z: number, rotationY = 0) => obj('streetlight', x, z, [0.4, 2.6, 0.4], { rotationY })
const crate = (x: number, z: number, material: MaterialId = 'wood', s = 0.8) => obj('crate', x, z, [s, s, s], { material, solid: true })

/**
 * "Forge District": a miniature futuristic city. Downtown towers (north-west), an industrial yard
 * with the goal (north-east), a residential block (south-east) and an open plaza where the
 * robot starts (south-west). Roads and plazas are walkable; buildings, walls, the loading dock
 * and the crates block navigation.
 */
export function forgeDistrict(): WorldSnapshot {
  const objects: WorldObject[] = [
    // Roads: main avenue (east–west), cross street split around the junction, industrial spur, side street.
    road(0, 1, 20, 1.6),
    road(-1, -4.9, 1.6, 10.2),
    road(-1, 5.9, 1.6, 8.2),
    road(5.25, -4.4, 1.4, 9.2),
    road(5.25, 6, 8.5, 1.2),

    // Plaza: the open area for agents.
    slab('concrete', -6, 5.5, 7, 0.06, 6),
    wall('brick', -6, 9.2, 6, 0.8),
    tree(-9, 3, 'round'),
    tree(-3.2, 3.1, 'round', 0.9),
    tree(-9, 8, 'pine'),
    tree(-3.2, 8, 'pine', 1.1),

    // Downtown towers.
    building('tower', -7.5, -7.5, 2.5, 7, 2.5),
    building('tower', -4, -7.5, 2.5, 5.5, 2.5, { color: '#a7c4dc' }),
    building('office', -7.5, -3.25, 3, 3.5, 2.5),
    building('tower', -4, -3.5, 2, 4.5, 2, { color: '#c6d3e2' }),
    lamp(-8, 2.1),
    lamp(-4, 2.1),
    lamp(-6, -0.1, Math.PI),
    lamp(-2.5, -0.1, Math.PI),
    tree(-9.3, -0.8, 'pine', 0.8),

    // Industrial district.
    building('industrial', 2.75, -3, 3.5, 2.5, 3),
    building('industrial', 2.75, -7.5, 3.5, 2.8, 3.5, { color: '#b5a99a' }),
    slab('metal', 2.75, -5.3, 2.5, 0.5, 0.8),
    // Fenced yard with a gate on its west side (z −6…−3.5); the goal sits inside.
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

    // Residential block.
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

export const PRESETS = [{ id: 'forge-district', label: 'Forge District (demo city)', build: forgeDistrict }] as const
