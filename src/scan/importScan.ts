import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { WORLD } from '../world/types'
import { analyzeTriangles, guessUnit } from './analyze'
import { getScanBlob, putScanBlob } from './blobStore'
import { installScan, useScan, MAX_PROPERTY_SCANS, MAX_PROPERTY_BYTES, type ScanSettings } from './store'

/** Hard cap: bigger files won't fit in a headset's memory. */
export const MAX_SCAN_BYTES = 250 * 1024 * 1024
/** Above this, warn that phones and headsets may struggle. */
export const LARGE_SCAN_BYTES = 60 * 1024 * 1024
/** Triangles sampled for floor and wall detection; the full model is still drawn. */
const SAMPLE_TRIANGLES = 300_000
/** Triangles used to work out where the scan blocks movement (all of them, up to this many). */
export const COLLISION_TRIANGLES = 2_000_000

/** Default ceiling cut, like an architect's floor-plan section. */
export const DEFAULT_CUT = 2.2


/** Why this file can't be imported, or null. Checks the name and the first bytes only. */
export function checkScanFile(name: string, head: Uint8Array, bytes: number): string | null {
  const lower = name.toLowerCase()
  if (bytes > MAX_SCAN_BYTES) return `This scan is ${Math.round(bytes / 1048576)} MB; the limit is ${MAX_SCAN_BYTES / 1048576} MB. Export it at a lower detail level.`
  if (lower.endsWith('.glb')) {
    const magic = String.fromCharCode(...head.slice(0, 4))
    return magic === 'glTF' ? null : 'This .glb file is damaged or isn’t a glTF model.'
  }
  if (lower.endsWith('.gltf')) return null
  if (/\.(usdz|obj|fbx|ply|spz|splat|e57|las|laz)$/.test(lower)) {
    return 'That format isn’t supported yet. Export the scan as .glb (Polycam, Scaniverse and RealityScan all offer it).'
  }
  return 'Choose a .glb scan file.'
}

async function parse(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  try {
    const gltf = await loader.parseAsync(buffer, '')
    return gltf.scene
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (/draco/i.test(text)) throw new Error('This scan uses Draco compression, which isn’t supported yet. Export it without compression.')
    if (/uri|fetch|load/i.test(text)) throw new Error('This .gltf points to separate files. Export the scan as a single .glb instead.')
    throw new Error(`Couldn’t read the scan: ${text}`)
  }
}

/** Every triangle of the model in its own coordinates (an even sample when there are more than `limit`). */
export function extractTriangles(root: THREE.Object3D, limit = SAMPLE_TRIANGLES): Float32Array {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  let total = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry?.attributes.position) return
    meshes.push(m)
    const g = m.geometry
    total += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  const step = Math.max(1, Math.ceil(total / limit))
  const out = new Float32Array(Math.ceil(total / step) * 9 + 9)
  const v = new THREE.Vector3()
  let w = 0
  let t = 0
  for (const m of meshes) {
    const pos = m.geometry.attributes.position
    const index = m.geometry.index
    const count = (index ? index.count : pos.count) / 3
    for (let i = 0; i < count; i++, t++) {
      if (t % step) continue
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(i * 3 + k) : i * 3 + k
        v.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld)
        out[w++] = v.x
        out[w++] = v.y
        out[w++] = v.z
      }
    }
  }
  return out.subarray(0, w)
}

const newScanId = () => `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/**
 * Import a scan: read, analyse (floor, wall angle, units), store on this device and show it.
 * With `relink`, the file replaces a missing model and keeps the current alignment.
 */
export async function importScanFile(file: File, { relink = false, targetId }: { relink?: boolean; targetId?: string } = {}): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  if (importing) return { ok: false, error: 'Another scan is being imported. Wait for it to finish.' }
  importing = true
  try { return await readScan(file, { relink, targetId }) }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Could not import scan.' } }
  finally { importing = false }
}
let importing = false

async function readScan(file: File, { relink, targetId }: { relink: boolean; targetId?: string }): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const before = useScan.getState()
  const existing = relink ? before.scans.find((s) => s.id === (targetId ?? before.activeId)) : undefined
  const fail = (error: string) => ({ ok: false as const, error })
  if (relink && !existing) return fail('Select the section to re-link first.')
  if (!existing && before.scans.length >= MAX_PROPERTY_SCANS) return fail('A property supports up to 24 scan sections.')
  if (before.scans.reduce((n, s) => n + s.bytes, 0) - (existing?.bytes ?? 0) + file.size > MAX_PROPERTY_BYTES) return fail('Property scans exceed 250 MB. Export lighter meshes or split the property.')
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const problem = checkScanFile(file.name, head, file.size)
  if (problem) return fail(problem)
  const buffer = await file.arrayBuffer()
  const root = await parse(buffer)
  if (before.generation !== useScan.getState().generation || (existing && !useScan.getState().scans.some((s) => s.id === existing.id))) {
    disposeScanModel(root)
    return fail('The world changed during import. Choose the file again in this world.')
  }
  const tri = extractTriangles(root)
  if (!tri.length) { disposeScanModel(root); return fail('This file has no 3D surfaces in it.') }
  if (!tri.every(Number.isFinite)) { disposeScanModel(root); return fail('This mesh contains invalid coordinates. Export a repaired GLB mesh.') }
  const unit = guessUnit(analyzeTriangles(tri).size)
  const analysis = analyzeTriangles(tri, unit)
  const blob = new Blob([buffer], { type: 'model/gltf-binary' })

  const scan: ScanSettings =
    relink && existing
      ? { ...existing, bytes: buffer.byteLength, analysis }
      : {
          id: newScanId(),
          name: file.name,
          bytes: buffer.byteLength,
          analysis,
          scale: unit,
          rotationY: -analysis.wallAngle,
          offset: [0, 0, 0],
          opacity: 0.85,
          visible: true,
          cutHeight: DEFAULT_CUT,
          blocks: true,
        }
  try {
    await putScanBlob(scan.id, blob)
  } catch {
    disposeScanModel(root)
    return fail('This browser couldn’t store the scan (storage may be full or blocked).')
  }
  if (before.generation !== useScan.getState().generation || (existing && !useScan.getState().scans.some((s) => s.id === existing.id))) {
    disposeScanModel(root)
    return fail('The world changed during import. Choose the file again.')
  }
  // Analysis is complete. The renderer loads visible sections on demand, avoiding a cache of hidden GPU models.
  disposeScanModel(root)
  installScan(scan, 'ready')

  const warnings: string[] = []
  if (unit !== 1) warnings.push(`The file looks like it's in ${unit === 0.01 ? 'centimetres' : 'millimetres'}, so it was scaled to metres.`)
  const span = Math.max(...analysis.footprint) * unit
  if (span > WORLD.half * 2) warnings.push(`The scan is about ${Math.round(span)} m across; the map is ${WORLD.half * 2} m, so parts fall outside it.`)
  if (buffer.byteLength > LARGE_SCAN_BYTES) warnings.push('This is a large file and may be slow on phones and headsets.')
  return { ok: true, ...(warnings.length ? { warning: warnings.join(' ') } : {}) }
}

/** Load a visible section from device storage; the caller owns and disposes the parsed model. */
export async function loadScanModel(id: string): Promise<THREE.Object3D | null> {
  const blob = await getScanBlob(id)
  if (!blob) return null
  const root = await parse(await blob.arrayBuffer())
  return root
}

/** Release a hidden/unmounted section's resources, including embedded textures. */
export function disposeScanModel(root: THREE.Object3D) {
  const resources = new Set<{ dispose(): void }>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (mesh.geometry) resources.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue
      resources.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value)
    }
  })
  for (const resource of resources) resource.dispose()
}
