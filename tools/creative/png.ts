/**
 * Minimal PNG codec (Node, node:zlib) for 8-bit non-interlaced images: enough for what browsers'
 * canvas.toBlob('image/png') produces, so the server can RE-CHECK prepared images itself (subject count,
 * transparency) instead of trusting numbers sent by the browser. Anything outside the subset throws;
 * callers fall back to header-only validation.
 */
import { deflateSync, inflateSync } from 'node:zlib'
import type { Rgba } from '../../src/creative/pixels.ts'

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

export function decodePng(buf: Uint8Array): Rgba {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let o = 8
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0
  const idat: Buffer[] = []
  while (o + 8 <= b.length) {
    const len = b.readUInt32BE(o)
    const type = b.toString('latin1', o + 4, o + 8)
    const data = b.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      depth = data[8]; colorType = data[9]; interlace = data[12]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    o += 12 + len
  }
  const ch = CHANNELS[colorType]
  if (depth !== 8 || !ch || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`)
  if (width * height > 64e6) throw new Error('PNG too large to decode')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * ch
  if (raw.length < height * (stride + 1)) throw new Error('PNG data truncated')
  const px = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch] : 0
      const up = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = y > 0 && x >= ch ? px[(y - 1) * stride + x - ch] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += up
      else if (f === 3) v += (a + up) >> 1
      else if (f === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      } else if (f !== 0) throw new Error(`bad PNG filter ${f}`)
      px[y * stride + x] = v & 255
    }
  }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    const s = p * ch
    if (ch === 4) data.set(px.subarray(s, s + 4), p * 4)
    else if (ch === 3) data.set([px[s], px[s + 1], px[s + 2], 255], p * 4)
    else if (ch === 2) data.set([px[s], px[s], px[s], px[s + 1]], p * 4)
    else data.set([px[s], px[s], px[s], 255], p * 4)
  }
  return { width, height, data }
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf: Buffer) {
  let c = -1
  for (const v of buf) c = CRC[(c ^ v) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type: string, data: Buffer) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** RGBA -> PNG (filter 0). Used for tests and server-made previews. */
export function encodePng(img: Rgba): Uint8Array {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4)
  ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(img.height * (img.width * 4 + 1))
  for (let y = 0; y < img.height; y++) Buffer.from(img.data.buffer, img.data.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1)
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}
