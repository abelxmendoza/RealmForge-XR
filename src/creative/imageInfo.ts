/**
 * Image header inspection and validation for artwork imports. Pure (no DOM, no Node), so the server
 * can validate uploaded bytes without decoding them and the browser can show the same verdict.
 *
 * Limits come from ProjectSim's Standard endpoint (docs.projectsim.ai, read 2026-10-21): exactly one
 * PNG / JPEG / WebP image, at most 100 MB. The docs give no pixel limits, so the resolution rules here
 * are our own quality gates (warnings, not provider errors), recorded as such in the report.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface ImageInfo {
  format: ImageFormat
  width: number
  height: number
  /** The encoding can carry alpha (PNG colour type 4/6 or tRNS, WebP alpha flag). JPEG never. */
  alphaChannel: boolean
}

export interface Issue {
  level: 'error' | 'warning'
  code: string
  message: string
}

export const PROVIDER_MAX_BYTES = 100 * 1024 * 1024
export const MIN_SIDE_PX = 512 // below this, generations lose detail (our gate, not the provider's)
export const RECOMMENDED_SIDE_PX = 1024
export const MAX_SIDE_PX = 8192 // beyond this the browser prep step runs out of canvas memory
export const MAX_ASPECT = 4

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 33 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 4) !== 'IHDR') return null
  const colorType = b[25]
  let alpha = colorType === 4 || colorType === 6
  // Walk chunks until IDAT looking for tRNS (palette / grey / RGB transparency).
  let o = 8
  while (!alpha && o + 8 <= b.length) {
    const len = u32be(b, o)
    const type = ascii(b, o + 4, 4)
    if (type === 'tRNS') alpha = true
    if (type === 'IDAT' || type === 'IEND') break
    o += 12 + len
  }
  return { format: 'png', width: u32be(b, 16), height: u32be(b, 20), alphaChannel: alpha }
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let o = 2
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null
    const marker = b[o + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2
      continue
    }
    const len = u16be(b, o + 2)
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (o + 9 > b.length) return null
      return { format: 'jpeg', height: u16be(b, o + 5), width: u16be(b, o + 7), alphaChannel: false }
    }
    o += 2 + len
  }
  return null
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8X') {
    return { format: 'webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, alphaChannel: (b[20] & 0x10) !== 0 }
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alphaChannel: ((bits >>> 28) & 1) === 1 }
  }
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { format: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, alphaChannel: false }
  }
  return null
}

/** Identify PNG / JPEG / WebP by magic bytes (never by file name) and read dimensions. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes)
}

export const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }

/** Header-level validation: format, byte size, resolution, aspect. Pixel-level checks live in pixels.ts. */
export function validateImageBytes(bytes: Uint8Array): { info: ImageInfo | null; issues: Issue[] } {
  const issues: Issue[] = []
  const info = readImageInfo(bytes)
  if (!info) {
    issues.push({ level: 'error', code: 'format', message: 'Not a PNG, JPEG or WebP image (checked by content, not file name).' })
    return { info, issues }
  }
  if (bytes.length > PROVIDER_MAX_BYTES) {
    issues.push({ level: 'error', code: 'too-large', message: `File is ${(bytes.length / 1e6).toFixed(1)} MB; ProjectSim accepts at most 100 MB.` })
  }
  const { width, height } = info
  if (width < 1 || height < 1) issues.push({ level: 'error', code: 'dimensions', message: 'Image has no pixels.' })
  else {
    const short = Math.min(width, height)
    const long = Math.max(width, height)
    if (long > MAX_SIDE_PX) issues.push({ level: 'error', code: 'too-big-px', message: `${width}×${height} exceeds ${MAX_SIDE_PX}px; resize before importing.` })
    if (short < MIN_SIDE_PX) issues.push({ level: 'warning', code: 'low-res', message: `Short side ${short}px is under ${MIN_SIDE_PX}px; expect a soft, low-detail model.` })
    else if (short < RECOMMENDED_SIDE_PX) issues.push({ level: 'warning', code: 'below-recommended', message: `Short side ${short}px; ${RECOMMENDED_SIDE_PX}px or more is recommended.` })
    if (long / short > MAX_ASPECT) issues.push({ level: 'warning', code: 'aspect', message: `Aspect ratio ${(long / short).toFixed(1)}:1; crop closer to the subject.` })
  }
  if (!info.alphaChannel) {
    issues.push({ level: 'warning', code: 'no-alpha', message: 'No transparency: the background will be modelled unless it is removed or plain.' })
  }
  return { info, issues }
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === 'error')
