/** Test fixtures: tiny valid GLBs and image headers built in memory (no binary files in the repo). */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function packGlb(json: any, bin?: Uint8Array): Uint8Array {
  const enc = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = Math.ceil(enc.length / 4) * 4
  const binLen = bin ? Math.ceil(bin.length / 4) * 4 : 0
  const total = 12 + 8 + jsonLen + (bin ? 8 + binLen : 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.fill(0x20, 20, 20 + jsonLen)
  out.set(enc, 20)
  if (bin) {
    const o = 20 + jsonLen
    dv.setUint32(o, binLen, true)
    dv.setUint32(o + 4, 0x004e4942, true)
    out.set(bin, o + 8)
  }
  return out
}

/** One quad (2 triangles) of size w×h in the XY plane, optional texture variants. */
export function quadGltf(opts: { w?: number; h?: number; texture?: 'embedded' | 'external' | 'none'; translation?: number[]; nan?: boolean } = {}) {
  const w = opts.w ?? 1, h = opts.h ?? 2
  const pos = new Float32Array([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0])
  if (opts.nan) pos[4] = NaN
  const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0])
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3])
  const png = tinyPng()
  const parts = [new Uint8Array(pos.buffer), new Uint8Array(uv.buffer), new Uint8Array(idx.buffer), ...(opts.texture === 'embedded' ? [png] : [])]
  const offsets: number[] = []
  let len = 0
  for (const p of parts) { offsets.push(len); len += Math.ceil(p.length / 4) * 4 }
  const bin = new Uint8Array(len)
  parts.forEach((p, i) => bin.set(p, offsets[i]))
  const json: any = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...(opts.translation ? { translation: opts.translation } : {}) }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.5, 0.2, 1] } }],
    buffers: [{ byteLength: len }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: pos.byteLength },
      { buffer: 0, byteOffset: offsets[1], byteLength: uv.byteLength },
      { buffer: 0, byteOffset: offsets[2], byteLength: idx.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [w, h, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
  }
  if (opts.texture === 'embedded' || opts.texture === 'external') {
    json.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 }
    json.textures = [{ source: 0 }]
    if (opts.texture === 'embedded') {
      json.bufferViews.push({ buffer: 0, byteOffset: offsets[3], byteLength: png.length })
      json.images = [{ bufferView: 3, mimeType: 'image/png', name: 'base_color' }]
    } else json.images = [{ uri: 'textures/base_color.png' }]
  }
  return { json, bin, glb: packGlb(json, bin) }
}

/** A real 1×1 opaque PNG (valid CRCs), 69 bytes. */
export function tinyPng(): Uint8Array {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4UaEBAAN0AWnL+tDXAAAAAElFTkSuQmCC'
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** PNG header only (enough for readImageInfo): colour type 6 = RGBA, 2 = RGB. */
export function pngHeader(width: number, height: number, colorType = 6, extraChunk?: string): Uint8Array {
  const out = new Uint8Array(8 + 25 + (extraChunk ? 12 : 0) + 12)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const dv = new DataView(out.buffer)
  dv.setUint32(8, 13)
  out.set([...'IHDR'].map((c) => c.charCodeAt(0)), 12)
  dv.setUint32(16, width)
  dv.setUint32(20, height)
  out[24] = 8
  out[25] = colorType
  let o = 33
  if (extraChunk) { dv.setUint32(o, 0); out.set([...extraChunk].map((c) => c.charCodeAt(0)), o + 4); o += 12 }
  dv.setUint32(o, 0)
  out.set([...'IDAT'].map((c) => c.charCodeAt(0)), o + 4)
  return out
}

export function jpegHeader(width: number, height: number): Uint8Array {
  // SOI, APP0 (len 16), SOF0
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255, 3]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...new Array(12).fill(0)])
}

export function webpVp8xHeader(width: number, height: number, alpha: boolean): Uint8Array {
  const out = new Uint8Array(30)
  out.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  out.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8)
  out.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12)
  out[20] = alpha ? 0x10 : 0
  const w = width - 1, h = height - 1
  out.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24)
  out.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27)
  return out
}
