import * as THREE from 'three'
import { useEditor } from '../editor/settings'
import { worldRootRef } from '../scene/worldRoot'
import { useWorld } from '../world/store'
import type { Vec3, WorldObject } from '../world/types'
import { blockMove, restHeight, useRoom } from './room'
import { getWebXRManager } from './session'

/**
 * "Respect real surfaces" (setting `realSurfaces`, off by default; P, HUD, wrist Surf.): virtual objects
 * rest on your real tables, desks and couches, and stop at real walls and furniture while you move them.
 * Needs Space Setup data (see room.ts). Not used at tabletop scale, where the whole map sits on one table.
 *
 * Objects stay in map-local metres in the store; these helpers convert through the world root to the
 * tracking space the room is in, and back.
 */
export const toggleRealSurfaces = () => useEditor.getState().set({ realSurfaces: !useEditor.getState().realSurfaces })

const v = new THREE.Vector3()
const head = new THREE.Vector3()
const scale = new THREE.Vector3()

function activeRoot(): THREE.Group | null {
  const editor = useEditor.getState()
  const root = worldRootRef.current
  if (!editor.realSurfaces || editor.worldScale === 'tabletop' || !root) return null
  if (!getWebXRManager()?.isPresenting) return null
  const room = useRoom.getState()
  if (!room.surfaces.length && !room.obstacles.length) return null
  root.updateWorldMatrix(true, false)
  return root
}

/** Map-local height an object at (x, z) should rest at: the real surface under it (below your eyes), else the ground (0). */
export function restLocalY(x: number, z: number): number {
  const root = activeRoot()
  if (!root) return 0
  const ground = root.localToWorld(v.set(x, 0, z))
  const [gx, gy, gz] = [ground.x, ground.y, ground.z]
  getWebXRManager()!.getCamera().getWorldPosition(head)
  // Only surfaces above the map's own ground count (the floor itself is the ground).
  const surfaces = useRoom.getState().surfaces.filter((s) => s.y > gy + 0.02)
  const y = restHeight([gx, gz], head.y, surfaces, gy)
  return Math.max(0, root.worldToLocal(v.set(gx, y, gz)).y)
}

/** Drop an object onto the real surface below it (after placing or releasing). No-op when the feature is off. */
export function settleObject(id: string) {
  const o = useWorld.getState().objects[id]
  if (!o || !activeRoot()) return
  const y = restLocalY(o.position[0], o.position[2])
  if (Math.abs(y - o.position[1]) > 1e-3) useWorld.getState().updateObject(id, { position: [o.position[0], y, o.position[2]] })
}

/** Limit a move of `o` from `from` to `to` (map-local) so its footprint stops at real walls and furniture. */
export function clampToRoom(o: WorldObject, from: Vec3, to: Vec3, size: Vec3 = o.size): Vec3 {
  const root = activeRoot()
  if (!root) return to
  root.getWorldScale(scale)
  const a = root.localToWorld(v.set(from[0], from[1], from[2]))
  const [ax, ay, az] = [a.x, a.y, a.z]
  const b = root.localToWorld(v.set(to[0], to[1], to[2]))
  const r = (Math.max(size[0], size[2]) / 2) * scale.x
  const [x, z] = blockMove([ax, az], [b.x, b.z], r, ay, useRoom.getState().obstacles)
  const local = root.worldToLocal(v.set(x, ay, z))
  return [local.x, to[1], local.z]
}
