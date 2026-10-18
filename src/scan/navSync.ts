import type * as THREE from 'three'
import { setStaticBlockers } from '../nav/blockers'
import { useWorld } from '../world/store'
import { blocksMovement } from './actions'
import { scanBlockerPoints } from './blockers'
import { COLLISION_TRIANGLES, disposeScanModel, extractTriangles, loadScanModel } from './importScan'
import { scanPosition, useScan, type ScanSettings } from './store'

type Loader = (id: string) => Promise<THREE.Object3D | null>

/** Full-resolution triangles per section file, so re-aligning doesn't re-read the model. */
const triangles = new Map<string, Float32Array>()
let lastKey = ''
let run = 0

const fileKey = (scan: ScanSettings) => `${scan.id}#${useScan.getState().runtime[scan.id]?.modelVersion ?? 0}`

/** What the blocked area depends on: each blocking section's file and placement — not opacity, visibility or the ceiling cut. */
function placementKey() {
  return JSON.stringify(
    useScan.getState().scans.filter(blocksMovement).map((s) => [fileKey(s), s.scale, s.rotationY, s.offset, s.analysis.floorY, s.analysis.center]),
  )
}

function apply(points: Float32Array) {
  setStaticBlockers(points)
  useScan.setState({ blockers: points.length ? points : null })
  // Robot, attendee, actors and planned routes all rebuild their grids on a geometry change.
  useWorld.setState((s) => ({ geometryVersion: s.geometryVersion + 1 }))
}

async function trianglesFor(scan: ScanSettings, load: Loader): Promise<Float32Array | null> {
  const key = fileKey(scan)
  const hit = triangles.get(key)
  if (hit) return hit
  const model = await load(scan.id).catch(() => null)
  if (!model) return null
  const tri = extractTriangles(model, COLLISION_TRIANGLES)
  disposeScanModel(model)
  triangles.set(key, tri)
  return tri
}

/**
 * Recompute where scans block movement. Only geometry 0.15–1.8 m above the main floor counts, so
 * upper-floor sections never block the ground floor; hidden sections still block (hiding is for viewing).
 */
export async function syncScanNavigation(load: Loader = loadScanModel): Promise<void> {
  const key = placementKey()
  if (key === lastKey) return
  lastKey = key
  const mine = ++run
  const sections = useScan.getState().scans.filter(blocksMovement)
  const live = new Set(useScan.getState().scans.map(fileKey))
  for (const k of triangles.keys()) if (!live.has(k)) triangles.delete(k)
  const parts: Float32Array[] = []
  for (const scan of sections) {
    const tri = await trianglesFor(scan, load)
    if (mine !== run) return
    if (tri) parts.push(scanBlockerPoints(tri, { scale: scan.scale, rotationY: scan.rotationY, position: scanPosition(scan) }))
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    all.set(p, at)
    at += p.length
  }
  apply(all)
}

/** Keep navigation in step with the scans (call once at editor start). Changes settle for 150 ms first. */
export function installScanNavigation(load: Loader = loadScanModel): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const unsub = useScan.subscribe(() => {
    if (placementKey() === lastKey) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void syncScanNavigation(load), 150)
  })
  void syncScanNavigation(load)
  return () => {
    unsub()
    if (timer) clearTimeout(timer)
  }
}
