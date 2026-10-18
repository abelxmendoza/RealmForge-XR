import { currentWorldFile, replaceWorld, type ReplaceOptions } from '../world/persistence'
import { parseWorld, type WorldFile } from '../world/serialize'
import { newId } from '../world/store'
import { getScanBlob, putScanBlob, deleteScanBlob } from './blobStore'
import { MAX_PROPERTY_BYTES, MAX_PROPERTY_SCANS, useScan } from './store'

const MAGIC = 'RFPROP01'
const HEADER = 12
const MAX_MANIFEST = 1024 * 1024
interface Manifest { world: WorldFile; assets: { id: string; bytes: number }[] }

async function checkGLB(blob: Blob) {
  if (blob.size < 12) throw new Error('Property assets must be complete GLB 2.0 meshes.')
  const glb = new DataView(await blob.slice(0, 12).arrayBuffer())
  if (glb.getUint32(0, true) !== 0x46546c67 || glb.getUint32(4, true) !== 2 || glb.getUint32(8, true) !== blob.size) throw new Error('Property assets must be complete GLB 2.0 meshes. Re-export as a single GLB file.')
}

/** Binary container: magic + uint32 LE manifest length + UTF-8 JSON + unmodified GLB files. */
export async function exportPropertyBundle(): Promise<Blob> {
  const world = currentWorldFile()
  const scans = world.scans ?? (world.scan ? [world.scan] : [])
  const assets: Manifest['assets'] = []
  const blobs: Blob[] = []
  for (const scan of scans) {
    const blob = await getScanBlob(scan.id)
    if (!blob) throw new Error(`Re-link “${scan.name}” before exporting the property.`)
    if (blob.size !== scan.bytes) throw new Error(`“${scan.name}” does not match its saved file. Re-link it first.`)
    await checkGLB(blob)
    assets.push({ id: scan.id, bytes: blob.size }); blobs.push(blob)
  }
  if (blobs.reduce((n, b) => n + b.size, 0) > MAX_PROPERTY_BYTES) throw new Error('Property bundle exceeds 250 MB.')
  const manifest = new TextEncoder().encode(JSON.stringify({ world, assets } satisfies Manifest))
  if (manifest.byteLength > MAX_MANIFEST) throw new Error('Property metadata exceeds 1 MB. Reduce the world size.')
  const header = new Uint8Array(HEADER)
  header.set(new TextEncoder().encode(MAGIC))
  new DataView(header.buffer).setUint32(8, manifest.byteLength, true)
  return new Blob([header, manifest, ...blobs], { type: 'application/octet-stream' })
}

export async function importPropertyBundle(file: Blob, opts: ReplaceOptions = {}) {
  const installed: string[] = []
  try {
    const generation = useScan.getState().generation
    if (file.size < HEADER || file.size > MAX_PROPERTY_BYTES + MAX_MANIFEST + HEADER) throw new Error('Invalid property bundle size (250 MB of scans maximum).')
    const header = await file.slice(0, HEADER).arrayBuffer()
    if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC) throw new Error('Not a RealmForge property bundle.')
    const length = new DataView(header).getUint32(8, true)
    if (length < 2 || length > MAX_MANIFEST || HEADER + length > file.size) throw new Error('Invalid property manifest length.')
    const manifest = JSON.parse(await file.slice(HEADER, HEADER + length).text()) as Manifest
    const parsed = parseWorld(manifest.world, newId)
    if (!parsed.ok) throw new Error(parsed.error)
    const scans = parsed.world.scans ?? (parsed.world.scan ? [parsed.world.scan] : [])
    if (!Array.isArray(manifest.assets) || manifest.assets.length !== scans.length || scans.length > MAX_PROPERTY_SCANS) throw new Error('Property assets do not match the sections.')
    // Never overwrite models belonging to another saved world on this device.
    const blobs: { id: string; blob: Blob }[] = []
    let offset = HEADER + length
    for (let i = 0; i < scans.length; i++) {
      const scan = scans[i], asset = manifest.assets[i]
      if (!asset || asset.id !== scan.id || !Number.isSafeInteger(asset.bytes) || asset.bytes < 12 || asset.bytes !== scan.bytes || offset + asset.bytes > file.size) throw new Error('Invalid or truncated property asset.')
      const blob = file.slice(offset, offset + asset.bytes, 'model/gltf-binary')
      await checkGLB(blob)
      scan.id = `scan-${crypto.randomUUID()}`
      blobs.push({ id: scan.id, blob }); offset += asset.bytes
    }
    if (offset !== file.size) throw new Error('Unexpected bytes in property bundle.')
    for (const item of blobs) { installed.push(item.id); await putScanBlob(item.id, item.blob) }
    if (generation !== useScan.getState().generation) throw new Error('The world changed while opening this bundle. Try again.')
    const result = await replaceWorld({ ...parsed.world, scans, scan: undefined }, opts)
    if (!result.ok) throw new Error(result.error)
    return result
  } catch (error) {
    await Promise.all(installed.map((id) => deleteScanBlob(id)))
    return { ok: false as const, error: error instanceof Error ? error.message : 'Could not open property.' }
  }
}

export async function downloadPropertyBundle() {
  const blob = await exportPropertyBundle()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'realmforge-property.rfproperty'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
