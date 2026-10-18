import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PalletStyle, RackStyle } from '../../world/types'
import { PALLET, RACK, rackBeamHeights } from '../../world/scale'

/**
 * Real-size warehouse geometry, merged so each object is a handful of draw calls (important on Quest 2:
 * a warehouse can hold hundreds of pallets). Everything is in metres with the origin at the base centre,
 * like every WorldObject. Results are cached and shared; callers must not dispose them.
 */

type Parts = THREE.BufferGeometry[]

/** Box of size w×h×d whose base centre is at (x, y, z). */
function box(parts: Parts, w: number, h: number, d: number, x: number, y: number, z: number) {
  parts.push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z))
}

const merge = (parts: Parts) => {
  const g = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!g) throw new Error('warehouse geometry: merge failed')
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** Pallet geometry split by material. `load`/`wrap` are null when the style has none. */
export interface PalletGeometry {
  wood: THREE.BufferGeometry
  load: THREE.BufferGeometry | null
  wrap: THREE.BufferGeometry | null
  /** Number of boards, blocks and boxes merged (for tests). */
  parts: number
}

const T = 0.022 // board thickness
const BLOCK_H = 0.078

/** Pallet boards and blocks only (EUR layout, simplified), 1.2 × 0.144 × 1.0 m. */
function palletWoodParts(parts: Parts) {
  const xs = [-0.525, 0, 0.525]
  const zs = [-0.45, 0, 0.45]
  // Bottom boards along x.
  for (const z of zs) box(parts, PALLET.width, T, z === 0 ? 0.145 : 0.1, 0, 0, z)
  // Nine blocks.
  for (const x of xs) for (const z of zs) box(parts, 0.145, BLOCK_H, z === 0 ? 0.145 : 0.1, x, T, z)
  // Stringer boards along z on top of the blocks.
  for (const x of xs) box(parts, 0.145, T, PALLET.depth, x, T + BLOCK_H, 0)
  // Top deck: five boards along x.
  for (const z of [-0.4275, -0.21, 0, 0.21, 0.4275]) box(parts, PALLET.width, T, z === 0 ? 0.145 : 0.1, 0, T * 2 + BLOCK_H, z)
}

/** Stacked cartons on a pallet: 3 × 3 per layer, 40 × 33 × 30 cm, up to `top` metres. */
function cartonParts(parts: Parts, top: number) {
  const bw = 0.4
  const bd = PALLET.depth / 3
  const bh = 0.3
  const gap = 0.006
  const layers = Math.max(1, Math.floor((top - PALLET.height + 1e-6) / bh))
  for (let l = 0; l < layers; l++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        box(parts, bw - gap, bh - gap, bd - gap, -PALLET.width / 2 + bw * (i + 0.5), PALLET.height + l * bh, -PALLET.depth / 2 + bd * (j + 0.5))
  return layers * bh
}

const palletCache = new Map<PalletStyle, PalletGeometry>()

/** Geometry for a pallet of `style` at its real size (scale the mesh if the object was resized). */
export function palletGeometry(style: PalletStyle): PalletGeometry {
  const cached = palletCache.get(style)
  if (cached) return cached
  const wood: Parts = []
  palletWoodParts(wood)
  let load: THREE.BufferGeometry | null = null
  let wrap: THREE.BufferGeometry | null = null
  let parts = wood.length
  if (style !== 'empty') {
    const cartons: Parts = []
    const loadH = cartonParts(cartons, PALLET.heightFor.boxes)
    parts += cartons.length
    load = merge(cartons)
    if (style === 'wrapped') {
      // Stretch wrap: a slightly larger shell around the load, up to the wrapped height.
      const h = Math.max(loadH, PALLET.heightFor.wrapped - PALLET.height)
      wrap = new THREE.BoxGeometry(PALLET.width + 0.02, h, PALLET.depth + 0.02).translate(0, PALLET.height + h / 2, 0)
      parts += 1
    }
  }
  const g: PalletGeometry = { wood: merge(wood), load, wrap, parts }
  palletCache.set(style, g)
  return g
}

/** Rack geometry split by material. */
export interface RackGeometry {
  frame: THREE.BufferGeometry
  beams: THREE.BufferGeometry
  /** Pallets stored in the rack (loaded racks only), by material. */
  wood: THREE.BufferGeometry | null
  load: THREE.BufferGeometry | null
  levels: number
}

const rackCache = new Map<string, RackGeometry>()

/** Pallet parts at (x, y, z), turned 90° so its 1.0 m side runs along the bay (two fit per level). */
function storedPallet(woodParts: Parts, loadParts: Parts, x: number, y: number, z: number) {
  const wood: Parts = []
  palletWoodParts(wood)
  const load: Parts = []
  cartonParts(load, PALLET.heightFor.boxes)
  for (const p of wood) woodParts.push(p.rotateY(Math.PI / 2).translate(x, y, z))
  for (const p of load) loadParts.push(p.rotateY(Math.PI / 2).translate(x, y, z))
}

/** Number of 2.7 m bays in a rack run `w` metres wide (at least one). */
export const rackBays = (w: number) => Math.max(1, Math.round(w / RACK.bay))

/**
 * A run of selective racking, `w` wide × `h` tall × `d` deep. The width is split into whole bays
 * (about 2.7 m each), with an upright frame between bays. Blue frames with horizontal bracing, orange
 * beam pairs every 1.5 m; a loaded rack holds two pallets per bay on the floor and on every beam level.
 * A whole run is still ~4 draw calls.
 */
export function rackGeometry(w: number, h: number, d: number, style: RackStyle): RackGeometry {
  const key = `${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}:${style}`
  const cached = rackCache.get(key)
  if (cached) return cached
  const u = RACK.upright
  const bays = rackBays(w)
  const bayW = w / bays
  const frameX = (i: number) => -w / 2 + u / 2 + i * ((w - u) / bays)
  const frame: Parts = []
  for (let i = 0; i <= bays; i++) {
    const x = frameX(i)
    for (const sz of [-1, 1]) box(frame, u, h, u, x, 0, sz * (d / 2 - u / 2))
    // Horizontal bracing between the two uprights of each frame, every ~1.2 m.
    for (let y = 0.15; y < h - 0.1; y += 1.2) box(frame, u * 0.5, 0.04, d - u, x, y, 0)
  }
  const beams: Parts = []
  const heights = rackBeamHeights(h)
  for (let i = 0; i < bays; i++) {
    const cx = (frameX(i) + frameX(i + 1)) / 2
    for (const y of heights) for (const sz of [-1, 1]) box(beams, bayW - u, RACK.beam, 0.05, cx, y, sz * (d / 2 - 0.025))
  }

  let wood: THREE.BufferGeometry | null = null
  let load: THREE.BufferGeometry | null = null
  if (style === 'loaded') {
    const woodParts: Parts = []
    const loadParts: Parts = []
    const levels = [0, ...heights.map((y) => y + RACK.beam)]
    const slot = (bayW - u) / 2
    for (let i = 0; i < bays; i++) {
      const cx = (frameX(i) + frameX(i + 1)) / 2
      for (const y of levels) for (const k of [-0.5, 0.5]) storedPallet(woodParts, loadParts, cx + k * slot, y, 0)
    }
    wood = merge(woodParts)
    load = merge(loadParts)
  }
  const g: RackGeometry = { frame: merge(frame), beams: merge(beams), wood, load, levels: heights.length + 1 }
  rackCache.set(key, g)
  return g
}
