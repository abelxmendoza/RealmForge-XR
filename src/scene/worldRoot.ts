import * as THREE from 'three'
import { WORLD, type Vec2 } from '../world/types'

/**
 * The map is drawn inside one group that scales map units (metres) to the chosen view:
 * a tabletop miniature up to life size. Store coordinates are always map-local;
 * use groundPoint() to turn a pointer ray into one.
 *
 * In AR, `src/xr/placement.ts` can re-pin this root onto a Space Setup table (+ optional anchor).
 */
export type ScaleId = 'tabletop' | 'room' | 'large' | 'life'

/** World scale relative to your room. ratio = real metres per map metre. */
export const SCALE_PRESETS: Record<ScaleId, { label: string; ratio: number }> = {
  tabletop: { label: 'Tabletop 1:60', ratio: 1 / 60 }, // ~1.3 m board (on your floor; Place pins it to a real table)
  room: { label: 'Room 1:20', ratio: 1 / 20 }, // ~4 m, on the floor
  large: { label: 'Large 1:4', ratio: 1 / 4 }, // ~20 m, walk among knee-high buildings
  life: { label: 'Life size 1:1', ratio: 1 }, // stand next to real doorways
}
export const SCALE_IDS = Object.keys(SCALE_PRESETS) as ScaleId[]

export const WORLD_ROOT = {
  // The grid always starts on the floor (y = 0 in the floor-level reference space).
  position: new THREE.Vector3(0, 0, -1.1),
  scale: SCALE_PRESETS.tabletop.ratio,
  /** World yaw (radians): set by the L gesture (primary axis), world pull and the map grab; kept by Recenter. */
  yaw: 0,
  /** Height of the real floor in the XR reference space (see xr/floor.ts); 0 outside XR. */
  floorY: 0,
}

export const worldRootRef: { current: THREE.Group | null } = { current: null }

/** Set when the world should be (re)placed in front of you on the next frame (see WorldScaler in Scene). */
export const placement = { pending: true }
/** Put the world back in front of you at the current scale (wrist menu "Recenter"). */
export const recenterWorld = () => {
  placement.pending = true
}

/** Tabletop scale: the board is small enough to have an edge you grab to move it (on the floor or a pinned table). */
export const onTable = (ratio: number) => ratio < SCALE_PRESETS.room.ratio

/**
 * Size in map units for something that should look about `tabletopReal` metres big at tabletop
 * and grow gently toward life size (handles, markers). Keeps controls reachable at every scale.
 */
export const uiSize = (ratio: number, tabletopReal = 0.03) => (tabletopReal + 0.2 * ratio) / ratio

/**
 * Where to put the world for a scale preset, given the viewer's head position and facing.
 * Every scale starts on the floor (y = 0). Tabletop and room scale sit just ahead of you; large and
 * life size put `anchor` (the robot start) 1.5 m in front of you, so you begin next to it.
 * ("Place" can still pin the world to a real table; see xr/WorldPlacement.)
 */
export function worldPlacement(id: ScaleId, head: THREE.Vector3, forward: THREE.Vector3, anchor: Vec2, yaw = 0): THREE.Vector3 {
  const ratio = SCALE_PRESETS[id].ratio
  const f = forward.clone().setY(0)
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1)
  f.normalize()
  const halfReal = WORLD.half * ratio
  if (onTable(ratio)) return new THREE.Vector3(head.x, 0, head.z).addScaledVector(f, halfReal + 0.45)
  if (id === 'room') return new THREE.Vector3(head.x, 0, head.z).addScaledVector(f, halfReal + 0.5)
  // The anchor turns with the world's yaw (three.js rotation.y: (x, z) → (x cos + z sin, −x sin + z cos)).
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const ax = (c * anchor[0] + s * anchor[1]) * ratio
  const az = (-s * anchor[0] + c * anchor[1]) * ratio
  return new THREE.Vector3(head.x - ax, 0, head.z - az).addScaledVector(f, 1.5)
}

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
