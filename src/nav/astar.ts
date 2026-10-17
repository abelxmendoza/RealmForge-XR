import type { Vec2 } from '../world/types'
import { cellToWorld, isBlocked, lineOfSight, nearestFree, worldToCell, type Cell, type Grid } from './grid'

const SQRT2 = Math.SQRT2
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
]

/** Grid A* (8-connected, no corner cutting, octile heuristic). Returns cells start→goal or null. */
export function astar(grid: Grid, start: Cell, goal: Cell): Cell[] | null {
  const n = grid.size
  const idx = (i: number, j: number) => j * n + i
  const s = idx(start[0], start[1])
  const t = idx(goal[0], goal[1])
  const g = new Float32Array(n * n).fill(Infinity)
  const parent = new Int32Array(n * n).fill(-1)
  const closed = new Uint8Array(n * n)
  const h = (k: number) => {
    const dx = Math.abs((k % n) - goal[0])
    const dz = Math.abs(Math.floor(k / n) - goal[1])
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz)
  }
  const heap = new MinHeap()
  g[s] = 0
  heap.push(s, h(s))

  while (heap.size) {
    const cur = heap.pop()
    if (closed[cur]) continue
    if (cur === t) break
    closed[cur] = 1
    const ci = cur % n
    const cj = Math.floor(cur / n)
    for (const [di, dj, cost] of NEIGHBOURS) {
      const ni = ci + di
      const nj = cj + dj
      if (isBlocked(grid, ni, nj)) continue
      // Don't squeeze diagonally between two blocked cells.
      if (di && dj && (isBlocked(grid, ci + di, cj) || isBlocked(grid, ci, cj + dj))) continue
      const nk = idx(ni, nj)
      const ng = g[cur] + cost
      if (ng < g[nk]) {
        g[nk] = ng
        parent[nk] = cur
        heap.push(nk, ng + h(nk))
      }
    }
  }
  if (s !== t && parent[t] === -1) return null
  const out: Cell[] = []
  for (let k = t; k !== -1; k = parent[k]) out.push([k % n, Math.floor(k / n)])
  return out.reverse()
}

/** Drop waypoints that have line of sight past them, so the robot walks readable straight lines. */
export function smooth(grid: Grid, pts: Vec2[]): Vec2[] {
  if (pts.length <= 2) return pts
  const out: Vec2[] = [pts[0]]
  let anchor = 0
  while (anchor < pts.length - 1) {
    let far = anchor + 1
    for (let k = pts.length - 1; k > anchor + 1; k--) {
      if (lineOfSight(grid, pts[anchor], pts[k])) {
        far = k
        break
      }
    }
    out.push(pts[far])
    anchor = far
  }
  return out
}

/**
 * Plan from a world point to a world point. If either end is inside an obstacle,
 * it is snapped to the nearest free cell. Returns world waypoints (first = start) or null.
 */
export function planPath(grid: Grid, from: Vec2, to: Vec2): Vec2[] | null {
  const s = nearestFree(grid, worldToCell(grid, from))
  const t = nearestFree(grid, worldToCell(grid, to))
  if (!s || !t) return null
  const cells = astar(grid, s, t)
  if (!cells) return null
  const pts = cells.map((c) => cellToWorld(grid, c))
  // Start from the robot's exact position when it is free, so it doesn't jump to a cell centre.
  const startFree = !isBlocked(grid, ...worldToCell(grid, from))
  if (startFree) pts[0] = from
  return smooth(grid, pts)
}

class MinHeap {
  private keys: number[] = []
  private pri: number[] = []
  get size() {
    return this.keys.length
  }
  push(k: number, p: number) {
    this.keys.push(k)
    this.pri.push(p)
    let i = this.keys.length - 1
    while (i > 0) {
      const up = (i - 1) >> 1
      if (this.pri[up] <= this.pri[i]) break
      this.swap(i, up)
      i = up
    }
  }
  pop(): number {
    const top = this.keys[0]
    const lastK = this.keys.pop()!
    const lastP = this.pri.pop()!
    if (this.keys.length) {
      this.keys[0] = lastK
      this.pri[0] = lastP
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.pri.length && this.pri[l] < this.pri[m]) m = l
        if (r < this.pri.length && this.pri[r] < this.pri[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
  private swap(a: number, b: number) {
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.pri[a], this.pri[b]] = [this.pri[b], this.pri[a]]
  }
}
