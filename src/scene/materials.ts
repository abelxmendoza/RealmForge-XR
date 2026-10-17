import * as THREE from 'three'
import type { BuildingStyle, MaterialId } from '../world/types'

/**
 * Procedural textures and shared materials for the miniature world.
 *
 * Everything is drawn into small canvases at startup, so nothing downloads and the Quest's GPU
 * only ever sees a handful of 128–256 px textures. Materials are cached and shared between
 * objects; geometry UVs are scaled in map units (see geometry.ts), so one texture tiles
 * correctly on a wall of any length.
 */

type Paint = (g: CanvasRenderingContext2D, s: number) => void

// Deterministic noise so textures look the same on every load.
let seed = 1
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

function canvasTexture(size: number, paint: Paint, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  seed = 7
  paint(g, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, alpha: number, light = '255,255,255', dark = '0,0,0') {
  for (let k = 0; k < n; k++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? light : dark},${alpha * rand()})`
    const r = 1 + rand() * 2
    g.fillRect(rand() * s, rand() * s, r, r)
  }
}

/** How many map units one texture repeat covers, per surface material. */
export const MATERIAL_TILE: Record<MaterialId, number> = {
  concrete: 2,
  brick: 1,
  metal: 1,
  glass: 2,
  wood: 1,
  asphalt: 2,
  grass: 2,
}

const SURFACE_PAINT: Record<MaterialId, Paint> = {
  concrete: (g, s) => {
    g.fillStyle = '#c4c2bc'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 900, 0.18)
    // Formwork seams: a panel per tile plus tie holes.
    g.strokeStyle = 'rgba(0,0,0,0.18)'
    g.lineWidth = 2
    g.strokeRect(1, 1, s - 2, s - 2)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    for (const x of [0.25, 0.75]) for (const y of [0.25, 0.75]) g.fillRect(x * s - 2, y * s - 2, 4, 4)
  },
  brick: (g, s) => {
    g.fillStyle = '#d8cfc2'
    g.fillRect(0, 0, s, s)
    const rows = 6
    const rh = s / rows
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? s / 4 : 0
      for (let k = -1; k < 3; k++) {
        const x = off + (k * s) / 2
        const shade = 0.85 + rand() * 0.3
        g.fillStyle = `rgb(${Math.round(168 * shade)},${Math.round(84 * shade)},${Math.round(62 * shade)})`
        g.fillRect(x + 2, r * rh + 2, s / 2 - 4, rh - 4)
      }
    }
    speckle(g, s, 300, 0.12)
  },
  metal: (g, s) => {
    // Corrugated cladding: vertical ribs.
    const grad = g.createLinearGradient(0, 0, s / 8, 0)
    grad.addColorStop(0, '#8f9aa3')
    grad.addColorStop(0.5, '#c7d0d6')
    grad.addColorStop(1, '#8f9aa3')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    speckle(g, s, 200, 0.08)
  },
  glass: (g, s) => {
    const grad = g.createLinearGradient(0, s, s, 0)
    grad.addColorStop(0, '#4f7896')
    grad.addColorStop(1, '#a9d2ea')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#dfe8ee'
    g.lineWidth = 3
    for (let k = 0; k <= 4; k++) {
      g.beginPath()
      g.moveTo((k * s) / 4, 0)
      g.lineTo((k * s) / 4, s)
      g.stroke()
    }
    g.lineWidth = 4
    g.strokeRect(0, s / 2, s, 0)
    g.strokeRect(0, 0, s, s)
  },
  wood: (g, s) => {
    const planks = 4
    for (let p = 0; p < planks; p++) {
      const shade = 0.85 + rand() * 0.25
      g.fillStyle = `rgb(${Math.round(158 * shade)},${Math.round(112 * shade)},${Math.round(70 * shade)})`
      g.fillRect(0, (p * s) / planks, s, s / planks)
      g.strokeStyle = 'rgba(60,35,15,0.25)'
      for (let k = 0; k < 6; k++) {
        const y = (p * s) / planks + rand() * (s / planks)
        g.beginPath()
        g.moveTo(0, y)
        g.bezierCurveTo(s / 3, y + 3, (2 * s) / 3, y - 3, s, y)
        g.stroke()
      }
      g.fillStyle = 'rgba(40,22,10,0.55)'
      g.fillRect(0, (p * s) / planks, s, 2)
    }
  },
  asphalt: (g, s) => {
    g.fillStyle = '#3d4247'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 1400, 0.22, '200,200,200', '0,0,0')
  },
  grass: (g, s) => {
    g.fillStyle = '#5f8f4e'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 1600, 0.25, '190,230,140', '20,60,20')
  },
}

/** Facade textures for buildings: [colour map, emissive map (lit windows)]. One repeat = FACADE_TILE. */
export const FACADE_TILE: Record<BuildingStyle, [w: number, h: number]> = {
  tower: [2, 2],
  office: [2, 1],
  house: [1.25, 1],
  industrial: [1, 1],
}

type FacadePaint = (g: CanvasRenderingContext2D, e: CanvasRenderingContext2D, s: number) => void

/** Lit or dark window: colour map gets the glass, emissive map gets the glow when lit. */
function paintWindow(g: CanvasRenderingContext2D, e: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, litChance: number) {
  const lit = rand() < litChance
  g.fillStyle = lit ? '#ffe9b8' : '#2b3a48'
  g.fillRect(x, y, w, h)
  if (lit) {
    e.fillStyle = rand() < 0.75 ? '#ffd27a' : '#8fe3ff'
    e.fillRect(x, y, w, h)
  } else {
    // Sky reflection on dark glass.
    g.fillStyle = 'rgba(160,200,230,0.25)'
    g.fillRect(x, y, w * 0.5, h)
  }
}

const FACADE_PAINT: Record<BuildingStyle, FacadePaint> = {
  tower: (g, e, s) => {
    // Curtain wall: a 4×4 grid of glass panels per 2×2 units, light mullions.
    g.fillStyle = '#e8eef3'
    g.fillRect(0, 0, s, s)
    const n = 4
    const c = s / n
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) paintWindow(g, e, i * c + 2, j * c + 3, c - 4, c - 6, 0.3)
  },
  office: (g, e, s) => {
    // One floor per repeat: a ribbon of windows across the middle, solid spandrel above and below.
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 300, 0.08)
    const n = 4
    const c = s / n
    for (let i = 0; i < n; i++) paintWindow(g, e, i * c + 4, s * 0.28, c - 8, s * 0.44, 0.35)
    g.fillStyle = 'rgba(0,0,0,0.12)'
    g.fillRect(0, s - 6, s, 6)
  },
  house: (g, e, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    speckle(g, s, 500, 0.1)
    const w = s * 0.42
    const h = s * 0.4
    const x = (s - w) / 2
    const y = s * 0.22
    g.fillStyle = '#f7f3ea'
    g.fillRect(x - 5, y - 5, w + 10, h + 10)
    paintWindow(g, e, x, y, w, h, 0.4)
    g.fillStyle = '#f7f3ea'
    g.fillRect(x + w / 2 - 2, y, 4, h)
    g.fillRect(x, y + h / 2 - 2, w, 4)
  },
  industrial: (g, e, s) => {
    const grad = g.createLinearGradient(0, 0, s / 6, 0)
    grad.addColorStop(0, '#b9c0c6')
    grad.addColorStop(0.5, '#ffffff')
    grad.addColorStop(1, '#b9c0c6')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    speckle(g, s, 300, 0.1)
    // High clerestory strip.
    paintWindow(g, e, 0, s * 0.08, s, s * 0.12, 0.5)
  },
}

const cache = new Map<string, THREE.Material>()
const textures = new Map<string, THREE.Texture>()

function memo<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key)
  if (!m) cache.set(key, (m = make()))
  return m as T
}

function surfaceTexture(id: MaterialId) {
  let t = textures.get(id)
  if (!t) textures.set(id, (t = canvasTexture(128, SURFACE_PAINT[id])))
  return t
}

const SURFACE_PROPS: Record<MaterialId, THREE.MeshStandardMaterialParameters> = {
  concrete: { roughness: 0.9, metalness: 0 },
  brick: { roughness: 0.95, metalness: 0 },
  metal: { roughness: 0.55, metalness: 0.2 },
  glass: { roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.82 },
  wood: { roughness: 0.85, metalness: 0 },
  asphalt: { roughness: 1, metalness: 0 },
  grass: { roughness: 1, metalness: 0 },
}

/** Shared surface material. `tint` multiplies the texture (white = as painted). */
export function surfaceMaterial(id: MaterialId, tint = '#ffffff') {
  return memo(`surface:${id}:${tint}`, () => new THREE.MeshStandardMaterial({ map: surfaceTexture(id), color: tint, ...SURFACE_PROPS[id] }))
}

function facadeTextures(style: BuildingStyle): [THREE.Texture, THREE.Texture] {
  const key = `facade:${style}`
  const hit = textures.get(key)
  if (hit) return [hit, textures.get(`${key}:e`)!]
  const size = 256
  const ec = document.createElement('canvas')
  ec.width = ec.height = size
  const e = ec.getContext('2d')!
  e.fillStyle = '#000'
  e.fillRect(0, 0, size, size)
  const map = canvasTexture(size, (g, s) => FACADE_PAINT[style](g, e, s))
  const emissive = new THREE.CanvasTexture(ec)
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping
  emissive.colorSpace = THREE.SRGBColorSpace
  textures.set(key, map)
  textures.set(`${key}:e`, emissive)
  return [map, emissive]
}

export function facadeMaterial(style: BuildingStyle, tint: string) {
  return memo(`facade:${style}:${tint}`, () => {
    const [map, emissiveMap] = facadeTextures(style)
    return new THREE.MeshStandardMaterial({
      map,
      emissiveMap,
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
      color: tint,
      roughness: style === 'tower' ? 0.35 : 0.85,
      metalness: style === 'tower' ? 0.25 : 0.05,
    })
  })
}

/** Plain shared materials for details (roofs, trims, doors, lamps, foliage). */
export function flatMaterial(color: string, opts: THREE.MeshStandardMaterialParameters = {}) {
  return memo(`flat:${color}:${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }))
}

/** Unlit glowing material (lamps, beacons). Cheaper than real lights and reads well in passthrough. */
export function glowMaterial(color: string) {
  return memo(`glow:${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false }))
}

/** Dashed road centre line, one dash per map unit along u. */
export function roadLineMaterial() {
  return memo('road-line', () => {
    let t = textures.get('road-line')
    if (!t)
      textures.set(
        'road-line',
        (t = canvasTexture(64, (g, s) => {
          g.clearRect(0, 0, s, s)
          g.fillStyle = '#f2e6a0'
          g.fillRect(0, 0, s * 0.55, s)
        })),
      )
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  })
}

/** Ground board texture: soft noise, tiled. Tint comes from the active environment. */
export function groundMaterial(tint = '#a9b8a8', base = '#c3cbc0') {
  return memo(`ground:${tint}:${base}`, () => {
    const map = canvasTexture(128, (g, s) => {
      g.fillStyle = base
      g.fillRect(0, 0, s, s)
      speckle(g, s, 1500, 0.1)
    })
    return new THREE.MeshStandardMaterial({ map, color: tint, roughness: 1 })
  })
}

/** Crate faces: frame + diagonal brace. UVs are left at 0..1 per face. */
export function crateMaterial(id: MaterialId) {
  return memo(`crate:${id}`, () => {
    const metal = id === 'metal'
    const map = canvasTexture(128, (g, s) => {
      g.fillStyle = metal ? '#6f8796' : '#b88a55'
      g.fillRect(0, 0, s, s)
      speckle(g, s, 400, 0.15)
      g.strokeStyle = metal ? '#d4a017' : '#7a5530'
      g.lineWidth = s * 0.12
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth)
      g.beginPath()
      g.moveTo(0, s)
      g.lineTo(s, 0)
      g.stroke()
    })
    return new THREE.MeshStandardMaterial({ map, roughness: metal ? 0.5 : 0.9, metalness: metal ? 0.2 : 0 })
  })
}
