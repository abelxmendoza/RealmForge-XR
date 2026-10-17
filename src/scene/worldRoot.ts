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
export const SCALE_PRESETS: Record<ScaleId, { label: string; short: string; ratio: number }> = {
  tabletop: { label: 'Miniature View (1:60)', short: '1:60', ratio: 1 / 60 }, // ~1.3 m board on a table
  room: { label: 'Room View (1:20)', short: '1:20', ratio: 1 / 20 }, // ~4 m, on the floor
  large: { label: 'Large View (1:4)', short: '1:4', ratio: 1 / 4 }, // ~20 m, walk among knee-high buildings
  life: { label: 'Life Size (1:1)', short: '1:1', ratio: 1 }, // stand next to real doorways
}
export const SCALE_IDS = Object.keys(SCALE_PRESETS) as ScaleId[]

/** Board height when it sits on a table. */
export const TABLE_HEIGHT = 0.8

export const WORLD_ROOT = {
  position: new THREE.Vector3(0, TABLE_HEIGHT, -1.1),
  scale: SCALE_PRESETS.tabletop.ratio,
}

export const worldRootRef: { current: THREE.Group | null } = { current: null }

/** Set when the world should be (re)placed in front of you on the next frame (see WorldScaler in Scene). */
export const placement = { pending: true }
/** Put the world back in front of you at the current scale (wrist menu "Recenter"). */
export const recenterWorld = () => {
  placement.pending = true
}

/** Whether the world sits on a table (true) or on your floor (false) at this scale. */
export const onTable = (ratio: number) => ratio < SCALE_PRESETS.room.ratio

/**
 * Size in map units for something that should look about `tabletopReal` metres big at tabletop
 * and grow gently toward life size (handles, markers). Keeps controls reachable at every scale.
 */
export const uiSize = (ratio: number, tabletopReal = 0.03) => (tabletopReal + 0.2 * ratio) / ratio

/**
 * Where to put the world for a scale preset, given the viewer's head position and facing.
 * On a table: centred ahead at table height. On the floor: small scales sit just ahead of you;
 * large and life size put `anchor` (the robot start) 1.5 m in front of you, so you begin next to it.
 */
export function worldPlacement(id: ScaleId, head: THREE.Vector3, forward: THREE.Vector3, anchor: Vec2): THREE.Vector3 {
  const ratio = SCALE_PRESETS[id].ratio
  const f = forward.clone().setY(0)
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1)
  f.normalize()
  const halfReal = WORLD.half * ratio
  if (onTable(ratio)) return new THREE.Vector3(head.x, TABLE_HEIGHT, head.z).addScaledVector(f, halfReal + 0.45)
  if (id === 'room') return new THREE.Vector3(head.x, 0, head.z).addScaledVector(f, halfReal + 0.5)
  return new THREE.Vector3(head.x - anchor[0] * ratio, 0, head.z - anchor[1] * ratio).addScaledVector(f, 1.5)
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
