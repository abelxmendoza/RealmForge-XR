import type { AssetId, DestinationRole } from './assetTypes'
import type { Vec2, Vec3, WorldObject } from './types'
import { WORLD, blocksNavigation } from './types'
import { snapFootprint } from './snap'

export interface CatalogAsset {
  id: AssetId
  name: string
  category: 'Equipment' | 'Destinations'
  kind: WorldObject['kind']
  size: Vec3
  color: string
  solid: boolean
  destinationRole?: DestinationRole
  description: string
}
export const ASSETS: readonly CatalogAsset[] = [
  { id: 'storage-rack', name: 'Storage rack', category: 'Equipment', kind: 'building', size: [4, 3, 1.5], color: '#ed964b', solid: true, description: 'Three shelf levels; the full footprint blocks navigation.' },
  { id: 'workstation', name: 'Workstation', category: 'Equipment', kind: 'building', size: [2.4, 1.5, 1.2], color: '#65a9b6', solid: true, description: 'Work bench with an inspection screen.' },
  { id: 'conveyor', name: 'Conveyor', category: 'Equipment', kind: 'platform', size: [4, 0.85, 1.2], color: '#7b8ea3', solid: true, description: 'Static conveyor section; blocks the robot.' },
  { id: 'cargo', name: 'Cargo container', category: 'Equipment', kind: 'crate', size: [1.2, 1.2, 1.2], color: '#cda36d', solid: true, description: 'Solid cargo, movable using the existing editor.' },
  { id: 'barrier', name: 'Safety barrier', category: 'Equipment', kind: 'wall', size: [3, 1.1, 0.4], color: '#ffc857', solid: true, description: 'Move into an aisle to test replanning.' },
  { id: 'loading-bay', name: 'Loading bay', category: 'Equipment', kind: 'platform', size: [5, 0.06, 4], color: '#f5b85b', solid: false, destinationRole: 'delivery', description: 'Walkable delivery bay. Send the robot to its center.' },
  { id: 'pickup-zone', name: 'Pickup zone', category: 'Destinations', kind: 'platform', size: [2.5, 0.04, 2.5], color: '#45c4c7', solid: false, destinationRole: 'pickup', description: 'Navigable pickup location; cargo handling is not automated yet.' },
  { id: 'delivery-zone', name: 'Delivery zone', category: 'Destinations', kind: 'platform', size: [2.5, 0.04, 2.5], color: '#f2b35d', solid: false, destinationRole: 'delivery', description: 'Navigable delivery destination.' },
  { id: 'charging-pad', name: 'Charging pad', category: 'Destinations', kind: 'platform', size: [2, 0.08, 2], color: '#72d995', solid: false, destinationRole: 'charging', description: 'Robot parking destination; battery simulation is a future feature.' },
  { id: 'inspection-point', name: 'Inspection point', category: 'Destinations', kind: 'platform', size: [2, 0.04, 2], color: '#bb9ded', solid: false, destinationRole: 'inspection', description: 'Navigable inspection checkpoint.' },
]
export const getAsset = (id: string) => ASSETS.find((asset) => asset.id === id)

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
    size: [...asset.size], rotationY, color: asset.color, material: 'metal', solid: asset.solid,
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
