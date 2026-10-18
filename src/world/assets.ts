import { getAsset } from './assetLibrary'
import type { Vec2, Vec3, WorldObject } from './types'
import { WORLD, blocksNavigation } from './types'
import { snapFootprint } from './snap'

export { ASSETS, getAsset, libraryAssets, type CatalogAsset } from './assetLibrary'

/** Preview and placement use this exact transform in world-local meters. */
export function buildAsset(id: string, at: Vec2, rotationY = 0, snap = true): Omit<WorldObject, 'id'> | null {
  const asset = getAsset(id)
  if (!asset || !at.every(Number.isFinite) || !Number.isFinite(rotationY)) return null
  const [w, , d] = asset.size
  const point = snap ? snapFootprint(at, w, d, rotationY) : at
  const ex = Math.abs(Math.cos(rotationY)) * w / 2 + Math.abs(Math.sin(rotationY)) * d / 2
  const ez = Math.abs(Math.sin(rotationY)) * w / 2 + Math.abs(Math.cos(rotationY)) * d / 2
  return {
    kind: asset.kind, assetId: asset.id, position: [Math.max(-WORLD.half + ex, Math.min(WORLD.half - ex, point[0])), 0, Math.max(-WORLD.half + ez, Math.min(WORLD.half - ez, point[1]))],
    size: [...asset.size], rotationY, color: asset.color, material: asset.material ?? 'metal', solid: asset.solid,
    ...(asset.style ? { style: asset.style } : {}),
    ...(asset.roof ? { roof: asset.roof } : {}),
    ...(asset.destinationRole ? { destinationRole: asset.destinationRole } : {}),
  }
}

/** Separating-axis footprint test for rotated rectangles. Touching edges are allowed. */
export function footprintsOverlap(a: Pick<WorldObject, 'position' | 'size' | 'rotationY'>, b: Pick<WorldObject, 'position' | 'size' | 'rotationY'>): boolean {
  const axes = (angle: number) => [[Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]]
  const aa = axes(a.rotationY), bb = axes(b.rotationY)
  const dx = a.position[0] - b.position[0], dz = a.position[2] - b.position[2]
  for (const [x, z] of [...aa, ...bb]) {
    const ra = Math.abs(x * aa[0][0] + z * aa[0][1]) * a.size[0] / 2 + Math.abs(x * aa[1][0] + z * aa[1][1]) * a.size[2] / 2
    const rb = Math.abs(x * bb[0][0] + z * bb[0][1]) * b.size[0] / 2 + Math.abs(x * bb[1][0] + z * bb[1][1]) * b.size[2] / 2
    if (Math.abs(dx * x + dz * z) >= ra + rb - 0.001) return false
  }
  return true
}
export function canPlaceAsset(object: Omit<WorldObject, 'id'>, objects: Iterable<WorldObject>): boolean {
  // Walkable zones may share roads, but no catalog item may overlap a solid obstacle.
  return ![...objects].some((other) => blocksNavigation(other) && footprintsOverlap(object, other))
}
