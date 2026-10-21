/**
 * glTF 2.0 / GLB inspector: the conversion gate between provider output and the library. Pure; external
 * files (buffers, textures) are fetched through an injected resolver, so the same code checks a folder
 * on disk (server) or an in-memory fixture (tests).
 *
 * It rejects files three.js would choke on or render wrongly (bad container, out-of-range accessors,
 * missing buffers or textures, NaN vertices, no triangles) and measures what the manifest records:
 * triangle count, world-space extents, textures.
 */

export interface GltfReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  container: 'glb' | 'gltf'
  triangles: number
  meshes: number
  extents: [number, number, number]
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
  textures: { name: string; mimeType: string; embedded: boolean; bytes: number }[]
}

export type Resolver = (uri: string) => Uint8Array | null

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/ktx2']

function decodeDataUri(uri: string): Uint8Array | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri)
  if (!m) return null
  if (!m[2]) return new TextEncoder().encode(decodeURIComponent(m[3]))
  const bin = atob(m[3])
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function parseGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array | null } {
  if (bytes.length < 20) throw new Error('file too short to be a GLB')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (bad magic)')
  if (dv.getUint32(4, true) !== 2) throw new Error(`unsupported GLB version ${dv.getUint32(4, true)}`)
  const length = dv.getUint32(8, true)
  if (length > bytes.length) throw new Error(`GLB header says ${length} bytes, file has ${bytes.length} (truncated)`)
  let o = 12
  let json: Json = null
  let bin: Uint8Array | null = null
  while (o + 8 <= length) {
    const len = dv.getUint32(o, true)
    const type = dv.getUint32(o + 4, true)
    if (o + 8 + len > length) throw new Error('GLB chunk runs past the end of the file')
    const data = bytes.subarray(o + 8, o + 8 + len)
    if (type === 0x4e4f534a && json === null) json = JSON.parse(new TextDecoder().decode(data))
    else if (type === 0x004e4942 && bin === null) bin = data
    o += 8 + len
  }
  if (json === null) throw new Error('GLB has no JSON chunk')
  return { json, bin }
}

type Mat4 = number[]
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k]
  return r
}
function trs(n: Json): Mat4 {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
const apply = (m: Mat4, p: number[]) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r])

export function inspectGltf(input: Uint8Array | { json: Json }, resolve: Resolver = () => null): GltfReport {
  const errors: string[] = []
  const warnings: string[] = []
  const report = (container: 'glb' | 'gltf', extra: Partial<GltfReport> = {}): GltfReport => ({
    ok: errors.length === 0, errors, warnings, container, triangles: 0, meshes: 0, extents: [0, 0, 0], bounds: null, textures: [], ...extra,
  })
  let json: Json
  let bin: Uint8Array | null = null
  let container: 'glb' | 'gltf' = 'gltf'
  try {
    if (input instanceof Uint8Array) {
      if (input[0] === 0x67 && input[1] === 0x6c && input[2] === 0x54 && input[3] === 0x46) {
        container = 'glb'
        ;({ json, bin } = parseGlb(input))
      } else json = JSON.parse(new TextDecoder().decode(input))
    } else json = input.json
  } catch (e) {
    errors.push(`unreadable: ${(e as Error).message}`)
    return report(container)
  }
  if (json?.asset?.version !== '2.0') errors.push(`asset.version must be "2.0" (got ${JSON.stringify(json?.asset?.version)})`)
  for (const ext of json.extensionsRequired ?? []) warnings.push(`requires extension ${ext}; the viewer may not support it`)

  // Buffers
  const buffers: (Uint8Array | null)[] = (json.buffers ?? []).map((b: Json, i: number) => {
    let data: Uint8Array | null
    if (b.uri === undefined) data = container === 'glb' && i === 0 ? bin : null
    else if (String(b.uri).startsWith('data:')) data = decodeDataUri(b.uri)
    else if (/^[a-z][a-z0-9+.-]*:/i.test(b.uri) || String(b.uri).split(/[\\/]/).includes('..')) {
      errors.push(`buffers[${i}]: refusing non-local uri ${b.uri}`)
      return null
    } else data = resolve(decodeURIComponent(b.uri))
    if (!data) { errors.push(`buffers[${i}]: missing data${b.uri ? ` (${b.uri})` : ''}`); return null }
    if (data.length < b.byteLength) { errors.push(`buffers[${i}]: has ${data.length} bytes, declares ${b.byteLength}`); return null }
    return data
  })
  const views: (Uint8Array | null)[] = (json.bufferViews ?? []).map((v: Json, i: number) => {
    const buf = buffers[v.buffer]
    if (buf === undefined) { errors.push(`bufferViews[${i}]: buffer ${v.buffer} does not exist`); return null }
    if (!buf) return null
    const off = v.byteOffset ?? 0
    if (off + v.byteLength > buf.length) { errors.push(`bufferViews[${i}]: range ${off}+${v.byteLength} exceeds buffer ${v.buffer}`); return null }
    return buf.subarray(off, off + v.byteLength)
  })
  const accessorOk = (json.accessors ?? []).map((a: Json, i: number) => {
    const cb = COMPONENT_BYTES[a.componentType]
    const ts = TYPE_SIZE[a.type]
    if (!cb || !ts || !Number.isInteger(a.count) || a.count < 1) { errors.push(`accessors[${i}]: invalid componentType/type/count`); return false }
    if (a.bufferView === undefined) return true // all-zero (or sparse-only) accessor is legal
    const view = views[a.bufferView]
    if (view === undefined) { errors.push(`accessors[${i}]: bufferView ${a.bufferView} does not exist`); return false }
    if (!view) return false
    const stride = json.bufferViews[a.bufferView].byteStride ?? cb * ts
    const need = (a.byteOffset ?? 0) + stride * (a.count - 1) + cb * ts
    if (need > view.length) { errors.push(`accessors[${i}]: needs ${need} bytes, bufferView has ${view.length}`); return false }
    return true
  })

  // Read float32 VEC3 positions (non-sparse) to catch NaN/Inf and get true local bounds.
  const positionBounds = (ai: number): { min: number[]; max: number[] } | null => {
    const a = json.accessors?.[ai]
    if (!a || !accessorOk[ai]) return null
    if (a.type !== 'VEC3') { errors.push(`accessors[${ai}]: POSITION must be VEC3`); return null }
    if (a.componentType !== 5126 || a.bufferView === undefined || a.sparse) {
      if (Array.isArray(a.min) && Array.isArray(a.max)) return { min: a.min, max: a.max }
      errors.push(`accessors[${ai}]: POSITION needs min/max`)
      return null
    }
    const view = views[a.bufferView]!
    const stride = json.bufferViews[a.bufferView].byteStride ?? 12
    const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let v = 0; v < a.count; v++) for (let c = 0; c < 3; c++) {
      const x = dv.getFloat32((a.byteOffset ?? 0) + v * stride + c * 4, true)
      if (!Number.isFinite(x)) { errors.push(`accessors[${ai}]: non-finite vertex position at vertex ${v}`); return null }
      if (x < min[c]) min[c] = x
      if (x > max[c]) max[c] = x
    }
    return { min, max }
  }

  // Meshes -> triangles + local bounds per mesh
  let triangles = 0
  const meshBounds: ({ min: number[]; max: number[] } | null)[] = (json.meshes ?? []).map((mesh: Json, mi: number) => {
    let mb: { min: number[]; max: number[] } | null = null
    for (const [pi, p] of (mesh.primitives ?? []).entries()) {
      const pos = p.attributes?.POSITION
      if (pos === undefined) { errors.push(`meshes[${mi}].primitives[${pi}]: no POSITION`); continue }
      const b = positionBounds(pos)
      if (!b) continue
      mb = mb ? { min: mb.min.map((v, k) => Math.min(v, b.min[k])), max: mb.max.map((v, k) => Math.max(v, b.max[k])) } : b
      const mode = p.mode ?? 4
      const n = p.indices !== undefined ? json.accessors?.[p.indices]?.count : json.accessors[pos].count
      if (p.indices !== undefined && !accessorOk[p.indices]) continue
      if (mode === 4) triangles += Math.floor(n / 3)
      else if (mode === 5 || mode === 6) triangles += Math.max(0, n - 2)
      else warnings.push(`meshes[${mi}].primitives[${pi}]: mode ${mode} is points/lines, not a surface`)
      if (p.material !== undefined && !json.materials?.[p.material]) errors.push(`meshes[${mi}].primitives[${pi}]: material ${p.material} does not exist`)
    }
    return mb
  })
  if (!json.meshes?.length) errors.push('no meshes')
  else if (triangles === 0) errors.push('no triangles')

  // Scene graph -> world bounds
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  const visit = (ni: number, parent: Mat4, depth: number) => {
    const n = json.nodes?.[ni]
    if (!n || depth > 64) { errors.push(`node ${ni} missing or graph too deep (cycle?)`); return }
    const m = mul(parent, trs(n))
    const mb = n.mesh !== undefined ? meshBounds[n.mesh] : null
    if (n.mesh !== undefined && json.meshes?.[n.mesh] === undefined) errors.push(`nodes[${ni}]: mesh ${n.mesh} does not exist`)
    if (mb) for (let c = 0; c < 8; c++) {
      const p = apply(m, [c & 1 ? mb.max[0] : mb.min[0], c & 2 ? mb.max[1] : mb.min[1], c & 4 ? mb.max[2] : mb.min[2]])
      min = min.map((v, k) => Math.min(v, p[k])); max = max.map((v, k) => Math.max(v, p[k]))
    }
    for (const c of n.children ?? []) visit(c, m, depth + 1)
  }
  const scene = json.scenes?.[json.scene ?? 0]
  const roots: number[] = scene?.nodes ?? (json.nodes ? json.nodes.map((_: Json, i: number) => i) : [])
  if (!scene && json.meshes?.length) warnings.push('no default scene; measured every node')
  for (const r of roots) visit(r, IDENTITY, 0)
  const bounds = Number.isFinite(min[0]) ? { min: min as [number, number, number], max: max as [number, number, number] } : null
  const extents = bounds ? ([0, 1, 2].map((k) => +(max[k] - min[k]).toFixed(6)) as [number, number, number]) : [0, 0, 0] as [number, number, number]
  if (bounds && extents.every((e) => e === 0)) errors.push('model has zero size')

  // Images / textures
  const textures: GltfReport['textures'] = (json.images ?? []).map((img: Json, i: number) => {
    const name = img.name ?? img.uri ?? `image_${i}`
    let data: Uint8Array | null = null
    let embedded = true
    if (img.bufferView !== undefined) data = views[img.bufferView] ?? null
    else if (typeof img.uri === 'string' && img.uri.startsWith('data:')) data = decodeDataUri(img.uri)
    else if (typeof img.uri === 'string') {
      embedded = false
      data = /^[a-z][a-z0-9+.-]*:/i.test(img.uri) || img.uri.split(/[\\/]/).includes('..') ? null : resolve(decodeURIComponent(img.uri))
    }
    if (!data) errors.push(`images[${i}]: missing texture ${img.uri ?? `(bufferView ${img.bufferView})`}`)
    let mime = img.mimeType ?? ''
    if (!mime && data) mime = data[0] === 0x89 ? 'image/png' : data[0] === 0xff ? 'image/jpeg' : ''
    if (mime && !IMAGE_MIMES.includes(mime)) warnings.push(`images[${i}]: unusual mimeType ${mime}`)
    return { name: String(name), mimeType: mime, embedded, bytes: data?.length ?? 0 }
  })
  for (const [i, t] of (json.textures ?? []).entries()) {
    if (t.source !== undefined && !json.images?.[t.source]) errors.push(`textures[${i}]: image ${t.source} does not exist`)
  }
  for (const [i, m] of (json.materials ?? []).entries()) {
    const refs = [m.pbrMetallicRoughness?.baseColorTexture, m.pbrMetallicRoughness?.metallicRoughnessTexture, m.normalTexture, m.occlusionTexture, m.emissiveTexture]
    for (const r of refs) if (r && !json.textures?.[r.index]) errors.push(`materials[${i}]: texture ${r.index} does not exist`)
  }
  if (triangles > 500_000) warnings.push(`${triangles} triangles is heavy for Quest; consider mesh.quality "low"`)

  return report(container, { triangles, meshes: json.meshes?.length ?? 0, extents, bounds, textures })
}
