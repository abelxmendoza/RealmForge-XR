import type { BuildingStyle, PalletStyle } from './types'

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

/**
 * EUR pallet (EN 13698-1): 1.2 m × 1.0 m footprint (width along local x, depth along local z), 0.144 m tall.
 * Loaded heights are the pallet plus its load.
 */
export const PALLET = {
  width: 1.2,
  depth: 1.0,
  height: 0.144,
  /** Total height per style (pallet + load). */
  heightFor: { empty: 0.144, boxes: 1.35, wrapped: 1.5 } as Record<PalletStyle, number>,
}

/**
 * Selective pallet racking: bays 2.7 m between uprights (fits two 1.0 m-wide pallets side by side),
 * 1.1 m deep frames, a beam level every 1.5 m. A rack object is a run of bays: its width sets how many
 * bays there are, its height how many levels.
 */
export const RACK = {
  bay: 2.7,
  depth: 1.1,
  levelPitch: 1.5,
  /** First beam level above the floor (the floor itself is level 0). */
  firstBeam: 1.5,
  upright: 0.08,
  beam: 0.12,
}

/** Beam heights for a rack of total height `h` (the top beam sits at or below the top of the uprights). */
export function rackBeamHeights(h: number): number[] {
  const out: number[] = []
  for (let y = RACK.firstBeam; y <= h - 0.1 + 1e-9; y += RACK.levelPitch) out.push(Math.round(y * 1000) / 1000)
  return out
}
