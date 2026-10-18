import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildGrid, isBlocked, worldToCell } from '../nav/grid'
import { planPath } from '../nav/astar'
import { setStaticBlockers, staticBlockers } from '../nav/blockers'
import { useWorld, newId } from '../world/store'
import { currentWorldFile } from '../world/persistence'
import { parseWorld } from '../world/serialize'
import { BLOCK_BAND, scanBlockerPoints } from './blockers'
import { syncScanNavigation } from './navSync'
import { installScan, patchScan, setScans, type ScanSettings } from './store'

type P = [number, number, number]
const quad = (a: P, b: P, c: P, d: P) => [...a, ...b, ...c, ...a, ...c, ...d]
const wall = (x0: number, z0: number, x1: number, z1: number, h = 3) => quad([x0, 0, z0], [x1, 0, z1], [x1, h, z1], [x0, h, z0])

/** 12 × 8 m room centred on the origin, 3 m high, a 1.2 m door in the south wall, a 0.4 m pillar, floor and ceiling. */
function room(): Float32Array {
  const [w, d, h] = [6, 4, 3]
  return new Float32Array([
    ...quad([-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]),
    ...quad([-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d]),
    ...wall(-w, -d, w, -d),
    ...wall(-w, -d, -w, d),
    ...wall(w, -d, w, d),
    ...wall(-w, d, -0.6, d),
    ...wall(0.6, d, w, d),
    ...wall(-2.2, -0.2, -1.8, -0.2),
    ...wall(-1.8, -0.2, -1.8, 0.2),
    ...wall(-1.8, 0.2, -2.2, 0.2),
    ...wall(-2.2, 0.2, -2.2, -0.2),
  ])
}
const at = { scale: 1, rotationY: 0, position: [0, 0, 0] as P }
const inside: [number, number] = [3, 0]
const outside: [number, number] = [0, 9]

const section = (id: string, extra: Partial<ScanSettings> = {}): ScanSettings => ({
  id,
  name: `${id}.glb`,
  bytes: 1000,
  analysis: { floorY: 0, center: [0, 0], footprint: [12, 8], wallAngle: 0, size: [12, 3, 8], triangles: 30 },
  scale: 1,
  rotationY: 0,
  offset: [0, 0, 0],
  opacity: 0.8,
  visible: true,
  cutHeight: 2.2,
  ...extra,
})

/** Stand-in for reading a scan file: a mesh made from the room triangles. */
async function load() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(room(), 3))
  return new THREE.Mesh(g)
}

beforeEach(() => {
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  setScans([])
})
afterEach(() => setStaticBlockers(new Float32Array(0)))

describe('scan walls block movement', () => {
  it('samples walls and the pillar, not the floor or ceiling', () => {
    const pts = scanBlockerPoints(room(), at)
    expect(pts.length).toBeGreaterThan(200)
    for (let i = 0; i < pts.length; i += 2) {
      const [x, z] = [pts[i], pts[i + 1]]
      const onWall = Math.abs(Math.abs(x) - 6) < 0.06 || Math.abs(Math.abs(z) - 4) < 0.06
      const onPillar = x >= -2.25 && x <= -1.75 && z >= -0.25 && z <= 0.25
      expect(onWall || onPillar).toBe(true)
    }
  })

  it('routes leave the room through the door and nowhere else', () => {
    const grid = buildGrid([], { blockers: scanBlockerPoints(room(), at) })
    const path = planPath(grid, inside, outside)!
    expect(path).not.toBeNull()
    const exit = path.find((p) => p[1] > 3.5 && p[1] < 4.5)
    if (exit) expect(Math.abs(exit[0])).toBeLessThan(0.6)
    // Sealing the door leaves no way out.
    const sealed = scanBlockerPoints(new Float32Array([...room(), ...wall(-0.6, 4, 0.6, 4)]), at)
    expect(planPath(buildGrid([], { blockers: sealed }), inside, outside)).toBeNull()
  })

  it('follows the scan’s placement (turned and moved)', () => {
    const pts = scanBlockerPoints(room(), { scale: 1, rotationY: Math.PI / 2, position: [10, 0, 0] })
    const grid = buildGrid([], { blockers: pts, inflate: 0 })
    // The west wall (x = −6) turned 90° lands on z = +6, shifted to x ≈ 10.
    expect(isBlocked(grid, ...worldToCell(grid, [10, 6]))).toBe(true)
    expect(isBlocked(grid, ...worldToCell(grid, [10, 0]))).toBe(false)
  })

  it('keeps 10 cm coverage along one huge wall triangle', () => {
    // A 60 m site boundary as a single triangle pair (the old 200-step cap spaced it 30 cm apart).
    const pts = scanBlockerPoints(new Float32Array(wall(-30, 0, 30, 0)), at)
    const xs = new Set<number>()
    for (let i = 0; i < pts.length; i += 2) xs.add(Math.round(pts[i] * 10))
    for (let x = -299; x <= 299; x++) expect(xs.has(x)).toBe(true)
    const grid = buildGrid([], { blockers: pts })
    expect(planPath(grid, [0, -5], [0, 5])).not.toBeNull()
    const fenced = (path: [number, number][] | null) => !path || path.every((p) => Math.abs(p[0]) > 29.5 || Math.abs(p[1]) > 0.1)
    expect(fenced(planPath(grid, [0, -5], [0, 5]))).toBe(true)
  })

  it('only counts surfaces in the walking band', () => {
    const raised = scanBlockerPoints(room(), { ...at, position: [0, BLOCK_BAND[1] + 0.1, 0] })
    expect(raised.length).toBe(0)
  })
})

describe('scan navigation sync', () => {
  it('feeds every planner through the shared grid and replans', async () => {
    installScan(section('ground'))
    const before = useWorld.getState().geometryVersion
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBeGreaterThan(0)
    expect(useWorld.getState().geometryVersion).toBe(before + 1)
    // Default grid (robot, attendee, routes) now sees the walls.
    expect(planPath(buildGrid([]), inside, [0, -9])).not.toBeNull()
    const grid = buildGrid([])
    expect(isBlocked(grid, ...worldToCell(grid, [6, 0]))).toBe(true)
  })

  it('upstairs, switched-off and removed sections stop blocking; hidden ones still block', async () => {
    installScan(section('ground'))
    await syncScanNavigation(load)
    patchScan({ visible: false }, 'ground')
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBeGreaterThan(0)
    patchScan({ offset: [0, 3, 0] }, 'ground')
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBe(0)
    patchScan({ offset: [0, 0, 0], blocks: false }, 'ground')
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBe(0)
    patchScan({ blocks: true }, 'ground')
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBeGreaterThan(0)
    setScans([])
    await syncScanNavigation(load)
    expect(staticBlockers().length).toBe(0)
  })

  it('saves the per-section switch', () => {
    installScan(section('garage', { blocks: false }))
    const parsed = parseWorld(JSON.parse(JSON.stringify(currentWorldFile('House'))), (kind) => newId(kind))
    const scans = parsed.ok ? (parsed.world.scans ?? (parsed.world.scan ? [parsed.world.scan] : [])) : []
    expect(scans[0]?.blocks).toBe(false)
  })
})
