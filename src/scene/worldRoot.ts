import * as THREE from 'three'
import type { Vec2 } from '../world/types'

/**
 * The map is drawn inside one group that turns map units into a tabletop miniature.
 * Store coordinates are always map-local; use groundPoint() to turn a pointer ray into one.
 *
 * Default pose is a floating tabletop in front of the desktop/VR camera.
 * In AR, `src/xr/placement.ts` can re-pin this root onto a Space Setup table (+ optional anchor).
 */
export const WORLD_ROOT = {
  position: new THREE.Vector3(0, 0.8, -1.1),
  scale: 0.07,
}

export const worldRootRef: { current: THREE.Group | null } = { current: null }

const plane = new THREE.Plane()
const hit = new THREE.Vector3()
const normal = new THREE.Vector3()
const origin = new THREE.Vector3()

/** Minimal shape shared by R3F and @react-three/xr pointer events. */
export interface RayEvent {
  ray?: THREE.Ray
  point: THREE.Vector3
}

/**
 * Where a pointer ray meets the map's ground plane (y = height), in map coordinates.
 * Works for mouse, controller rays and hand rays alike.
 */
export function groundPoint(e: RayEvent, height = 0): Vec2 | null {
  const root = worldRootRef.current
  if (!root) return null
  root.updateWorldMatrix(true, false)
  origin.set(0, height, 0).applyMatrix4(root.matrixWorld)
  normal.set(0, 1, 0).transformDirection(root.matrixWorld)
  plane.setFromNormalAndCoplanarPoint(normal, origin)
  const p = e.ray && e.ray.intersectPlane(plane, hit) ? hit : e.point
  const local = root.worldToLocal(p.clone())
  return [local.x, local.z]
}
