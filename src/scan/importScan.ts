import * as THREE from 'three'
import { GLTFLoader, OBJLoader } from 'three-stdlib'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { WORLD } from '../world/types'
import { analyzeTriangles, guessUnit } from './analyze'
import { getScanBlob, putScanBlob } from './blobStore'
import { setScan, setScanStatus, useScan, type ScanSettings } from './store'

/** Hard cap: bigger files won't fit in a headset's memory. */
export const MAX_SCAN_BYTES = 250 * 1024 * 1024
/** Above this, warn that phones and headsets may struggle. */
export const LARGE_SCAN_BYTES = 60 * 1024 * 1024
/** Triangles sampled for floor and wall detection; the full model is still drawn. */
const SAMPLE_TRIANGLES = 300_000

/** Default ceiling cut, like an architect's floor-plan section. */
export const DEFAULT_CUT = 2.2

/** Parsed models by scan id, so the scene doesn't parse a file the importer just read. */
const parsed = new Map<string, THREE.Object3D>()

/** Why this file can't be imported, or null. Checks the name and the first bytes only. */
export function checkScanFile(name: string, head: Uint8Array, bytes: number): string | null {
  const lower = name.toLowerCase()
  if (bytes > MAX_SCAN_BYTES) return `This scan is ${Math.round(bytes / 1048576)} MB; the limit is ${MAX_SCAN_BYTES / 1048576} MB. Export it at a lower detail level.`
  if (lower.endsWith('.glb')) {
    const magic = String.fromCharCode(...head.slice(0, 4))
    return magic === 'glTF' ? null : 'This .glb file is damaged or isn’t a glTF model.'
  }
  if (lower.endsWith('.gltf')) return null
  if (lower.endsWith('.obj')) return bytes > 0 ? null : 'This OBJ file is empty.'
  if (/\.(usdz|fbx|ply|e57|las|laz)$/.test(lower)) {
    return 'That format isn’t supported yet. Export a .glb or a single .obj mesh. For USDZ or FBX, convert to GLB using a 3D editor.'
  }
  return 'Choose a .glb or .obj scan file.'
}

async function parse(buffer: ArrayBuffer, name = ''): Promise<THREE.Object3D> {
  if (name.toLowerCase().endsWith('.obj')) {
    const decoded = new TextDecoder().decode(buffer)
    const model = new OBJLoader().parse(decoded)
    if (!model.children.length) throw new Error('This OBJ has no readable geometry.')
    return model
  }
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

/** Every triangle of the model in its own coordinates (a sample for very large scans). */
export function extractTriangles(root: THREE.Object3D): Float32Array {
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
  const step = Math.max(1, Math.ceil(total / SAMPLE_TRIANGLES))
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
export async function importScanFile(file: File, { relink = false } = {}): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  // Check the size and header before reading a possibly huge file into memory.
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const problem = checkScanFile(file.name, head, file.size)
  if (problem) return { ok: false, error: problem }

  const before = useScan.getState()
  const fail = (error: string) => {
    setScanStatus(before.status, before.message)
    return { ok: false as const, error }
  }
  setScanStatus('loading', `Reading ${file.name}…`)
  let buffer: ArrayBuffer
  let root: THREE.Object3D
  try {
    buffer = await file.arrayBuffer()
    root = await parse(buffer, file.name)
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }

  const tri = extractTriangles(root)
  if (!tri.length) return fail('This file has no 3D surfaces in it.')
  const unit = guessUnit(analyzeTriangles(tri).size)
  const analysis = analyzeTriangles(tri, unit)
  const blob = new Blob([buffer], { type: file.name.toLowerCase().endsWith('.obj') ? 'text/plain' : 'model/gltf-binary' })

  const existing = useScan.getState().scan
  const scan: ScanSettings =
    relink && existing
      ? { ...existing, name: file.name, bytes: buffer.byteLength, analysis }
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
        }
  try {
    await putScanBlob(scan.id, blob)
  } catch {
    return fail('This browser couldn’t store the scan (storage may be full or blocked).')
  }
  parsed.set(scan.id, root)
  setScan(scan, 'ready')

  const warnings: string[] = []
  if (unit !== 1) warnings.push(`The file looks like it's in ${unit === 0.01 ? 'centimetres' : 'millimetres'}, so it was scaled to metres.`)
  const span = Math.max(...analysis.footprint) * unit
  if (span > WORLD.half * 2) warnings.push(`The scan is about ${Math.round(span)} m across; the map is ${WORLD.half * 2} m, so parts fall outside it.`)
  if (buffer.byteLength > LARGE_SCAN_BYTES) warnings.push('This is a large file and may be slow on phones and headsets.')
  return { ok: true, ...(warnings.length ? { warning: warnings.join(' ') } : {}) }
}

/** The model for a scan id: parsed already this session, or read back from on-device storage. */
export async function loadScanModel(id: string): Promise<THREE.Object3D | null> {
  const hit = parsed.get(id)
  if (hit) return hit
  const blob = await getScanBlob(id)
  if (!blob) return null
  const scan = useScan.getState().scan
  const name = scan?.id === id ? scan.name : ''
  const root = await parse(await blob.arrayBuffer(), name)
  parsed.set(id, root)
  return root
}
