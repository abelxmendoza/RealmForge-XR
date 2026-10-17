import type { BuildingStyle } from './types'

/**
 * Real-world proportions. 1 map unit = 1 m, so at the life-size view (1:1) these are true sizes:
 * a door you can walk through, storeys you can count, windows at real sill height.
 * The tabletop view only scales the whole world down; it never changes these numbers.
 */

/** Height of one storey (floor to floor). Facade textures repeat once per storey. */
export const STOREY = 3

/** Ground-floor door [width, height] per building style. */
export const DOOR: Record<BuildingStyle, [w: number, h: number]> = {
  tower: [2, 2.6], // glass double door
  office: [1.8, 2.4], // glass double door
  house: [1, 2.1], // single wooden door
  industrial: [3.5, 3.5], // roller garage door
}

/** Facade repeat [bay width, storey height] per style: one window bay per horizontal repeat. */
export const FACADE_BAY: Record<BuildingStyle, [w: number, h: number]> = {
  tower: [3, STOREY], // curtain wall panels
  office: [3, STOREY], // ribbon windows
  house: [3, STOREY], // one window per bay
  industrial: [4, 4.5], // tall bays, high clerestory strip
}
