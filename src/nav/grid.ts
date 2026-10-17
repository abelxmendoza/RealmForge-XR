import { GRID_SIZE, WORLD, type Vec2, type WorldObject } from '../world/types'

/** Occupancy grid over the map. cells[j * size + i] = 1 when blocked. i follows x, j follows z. */
export interface Grid {
  size: number
  cell: number
  half: number
  cells: Uint8Array
}

export type Cell = [i: number, j: number]

export function worldToCell(grid: Grid, [x, z]: Vec2): Cell {
  const i = Math.floor((x + grid.half) / grid.cell)
  const j = Math.floor((z + grid.half) / grid.cell)
  return [clampIdx(i, grid.size), clampIdx(j, grid.size)]
}

export function cellToWorld(grid: Grid, [i, j]: Cell): Vec2 {
  return [-grid.half + (i + 0.5) * grid.cell, -grid.half + (j + 0.5) * grid.cell]
}

const clampIdx = (v: number, size: number) => Math.max(0, Math.min(size - 1, v))

export const inBounds = (g: Grid, i: number, j: number) => i >= 0 && j >= 0 && i < g.size && j < g.size
export const isBlocked = (g: Grid, i: number, j: number) => !inBounds(g, i, j) || g.cells[j * g.size + i] === 1

/**
 * Rasterise obstacle footprints (rotated rectangles) into a grid, inflated by `inflate`
 * so the robot's centre can treat free cells as safe.
 */
export function buildGrid(
  objects: Iterable<WorldObject>,
  opts: { size?: number; cell?: number; half?: number; inflate?: number } = {},
): Grid {
  const size = opts.size ?? GRID_SIZE
  const cell = opts.cell ?? WORLD.cell
  const half = opts.half ?? WORLD.half
  const inflate = opts.inflate ?? WORLD.robotRadius
  const cells = new Uint8Array(size * size)
  const grid: Grid = { size, cell, half, cells }

  for (const o of objects) {
    const hx = o.size[0] / 2 + inflate
    const hz = o.size[2] / 2 + inflate
    const cos = Math.cos(o.rotationY)
    const sin = Math.sin(o.rotationY)
    const [cx, , cz] = o.position
    // AABB of the rotated, inflated rectangle limits which cells we test.
    const ex = Math.abs(cos) * hx + Math.abs(sin) * hz
    const ez = Math.abs(sin) * hx + Math.abs(cos) * hz
    const [i0, j0] = worldToCell(grid, [cx - ex, cz - ez])
    const [i1, j1] = worldToCell(grid, [cx + ex, cz + ez])
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const [wx, wz] = cellToWorld(grid, [i, j])
        const dx = wx - cx
        const dz = wz - cz
        // Rotate the cell centre into the object's local frame (inverse of a +y yaw).
        const lx = cos * dx - sin * dz
        const lz = sin * dx + cos * dz
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) cells[j * size + i] = 1
      }
    }
  }
  return grid
}

/** Nearest free cell by breadth-first search, or null if the grid is full. */
export function nearestFree(grid: Grid, start: Cell): Cell | null {
  if (!isBlocked(grid, start[0], start[1])) return start
  const seen = new Uint8Array(grid.size * grid.size)
  const queue: Cell[] = [start]
  seen[start[1] * grid.size + start[0]] = 1
  for (let head = 0; head < queue.length; head++) {
    const [i, j] = queue[head]
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (!inBounds(grid, ni, nj) || seen[nj * grid.size + ni]) continue
      if (!isBlocked(grid, ni, nj)) return [ni, nj]
      seen[nj * grid.size + ni] = 1
      queue.push([ni, nj])
    }
  }
  return null
}

/** True if the straight segment a→b stays in free cells. */
export function lineOfSight(grid: Grid, a: Vec2, b: Vec2): boolean {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (grid.cell * 0.25)))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const [i, j] = worldToCell(grid, [a[0] + dx * t, a[1] + dz * t])
    if (isBlocked(grid, i, j)) return false
  }
  return true
}

/** True if every segment of the polyline is still free. */
export function pathIsClear(grid: Grid, points: Vec2[]): boolean {
  for (let k = 1; k < points.length; k++) if (!lineOfSight(grid, points[k - 1], points[k])) return false
  return true
}
