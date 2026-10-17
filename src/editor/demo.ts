import { WALL_DEFAULTS, clampToWorld, useWorld } from '../world/store'
import type { Vec2 } from '../world/types'
import { remainingRoute } from '../nav/navigation'

/** Point and direction a fraction of the way along a polyline. */
function along(pts: Vec2[], frac: number): { p: Vec2; dir: Vec2 } | null {
  let total = 0
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])
  if (total < 1) return null
  let want = total * frac
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0]
    const dz = pts[k][1] - pts[k - 1][1]
    const len = Math.hypot(dx, dz)
    if (want <= len) return { p: [pts[k - 1][0] + (dx * want) / len, pts[k - 1][1] + (dz * want) / len], dir: [dx / len, dz / len] }
    want -= len
  }
  return null
}

/**
 * Demo helper: slide a wall across the robot's route so it has to replan.
 * Moves the selected wall (or the first wall in the scene, or a new one) over ~0.7 s.
 */
export function blockRoute() {
  const hit = along(remainingRoute(), 0.45)
  if (!hit) return
  const w = useWorld.getState()
  const walls = Object.values(w.objects).filter((o) => o.kind === 'wall')
  const wall = (w.selectedId && w.objects[w.selectedId]?.kind === 'wall' ? w.objects[w.selectedId] : walls[0]) ?? null

  // Wall runs perpendicular to the route: its local +x should point along (−dz, dx).
  const [dx, dz] = hit.dir
  const rotationY = Math.atan2(-dx, -dz)
  const target: Vec2 = [clampToWorld(hit.p[0], 1), clampToWorld(hit.p[1], 1)]
  const length = Math.max(20, wall?.size[0] ?? 0)

  if (!wall) {
    const id = w.addObject({ kind: 'wall', position: [target[0], 0, target[1]], size: [length, WALL_DEFAULTS.height, WALL_DEFAULTS.thickness], rotationY, color: WALL_DEFAULTS.color })
    w.select(id)
    return
  }

  w.select(wall.id)
  const from = { x: wall.position[0], z: wall.position[2], r: wall.rotationY }
  let dr = rotationY - from.r
  while (dr > Math.PI) dr -= Math.PI * 2
  while (dr < -Math.PI) dr += Math.PI * 2
  const t0 = performance.now()
  const step = (): boolean => {
    const t = Math.min(1, (performance.now() - t0) / 700)
    const e = t * t * (3 - 2 * t)
    useWorld.getState().updateObject(wall.id, {
      position: [from.x + (target[0] - from.x) * e, 0, from.z + (target[1] - from.z) * e],
      rotationY: from.r + dr * e,
      size: [length, wall.size[1], wall.size[2]],
    })
    return t >= 1
  }
  anim = step
}

// Animations run from the render loop (window.requestAnimationFrame pauses during an XR session).
let anim: (() => boolean) | null = null
export function tickDemo() {
  if (anim && anim()) anim = null
}
