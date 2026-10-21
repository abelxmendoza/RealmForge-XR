/**
 * Non-destructive image preparation on raw RGBA buffers. Pure functions: every op returns a NEW
 * buffer and never touches its input, so the original artwork is never modified. The browser feeds
 * these from a canvas (ImageData has the same shape); tests feed synthetic buffers.
 *
 * Background removal here is deliberately simple and honest: it clears pixels connected to the image
 * border whose colour is close to the sampled border colour (a flood fill). That works for artwork on a
 * plain or near-plain backdrop. It is NOT a segmentation model; busy backgrounds need an external tool
 * (or ProjectSim's own multi_subject_image isolation).
 */

export interface Rgba {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type PrepOp =
  | { op: 'crop'; x: number; y: number; width: number; height: number }
  | { op: 'remove-background'; tolerance: number }
  | { op: 'pad'; marginFraction: number; square: boolean }
  | { op: 'resize'; maxSide: number }

export const ALPHA_VISIBLE = 16

export function makeRgba(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(fill, i)
  return { width, height, data }
}

/** Fraction of pixels that are (partly) transparent, and whether any alpha < 255 exists. */
export function alphaStats(img: Rgba) {
  let transparent = 0
  let translucent = 0
  const n = img.width * img.height
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] < ALPHA_VISIBLE) transparent++
    else if (img.data[i] < 255) translucent++
  }
  return { transparentFraction: n ? transparent / n : 0, translucentFraction: n ? translucent / n : 0, usesAlpha: transparent + translucent > 0 }
}

/** Median colour of the 1-pixel border: the presumed backdrop. */
export function borderColor(img: Rgba): [number, number, number] {
  const r: number[] = [], g: number[] = [], b: number[] = []
  const push = (x: number, y: number) => {
    const i = (y * img.width + x) * 4
    r.push(img.data[i]); g.push(img.data[i + 1]); b.push(img.data[i + 2])
  }
  for (let x = 0; x < img.width; x++) { push(x, 0); push(x, img.height - 1) }
  for (let y = 1; y < img.height - 1; y++) { push(0, y); push(img.width - 1, y) }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1] ?? 0
  return [med(r), med(g), med(b)]
}

const dist = (d: Uint8ClampedArray, i: number, c: [number, number, number]) =>
  Math.max(Math.abs(d[i] - c[0]), Math.abs(d[i + 1] - c[1]), Math.abs(d[i + 2] - c[2]))

/**
 * Foreground mask: alpha when the image uses transparency, otherwise "differs from the border colour".
 * 1 = subject, 0 = background.
 */
export function foregroundMask(img: Rgba, tolerance = 24): Uint8Array {
  const mask = new Uint8Array(img.width * img.height)
  const useAlpha = alphaStats(img).transparentFraction > 0.01
  const bg = borderColor(img)
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    mask[p] = useAlpha ? (img.data[i + 3] >= ALPHA_VISIBLE ? 1 : 0) : img.data[i + 3] >= ALPHA_VISIBLE && dist(img.data, i, bg) > tolerance ? 1 : 0
  }
  return mask
}

/**
 * Count separate subjects: 8-connected foreground components larger than `minFraction` of the image.
 * Specks (signatures, noise) under the threshold are reported separately rather than counted.
 */
export function countSubjects(img: Rgba, opts: { tolerance?: number; minFraction?: number } = {}) {
  const { width: w, height: h } = img
  const mask = foregroundMask(img, opts.tolerance)
  const minArea = Math.max(1, Math.round((opts.minFraction ?? 0.01) * w * h))
  const seen = new Uint8Array(w * h)
  const areas: number[] = []
  const boxes: { x: number; y: number; width: number; height: number; area: number }[] = []
  let specks = 0
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0
    stack.push(start); seen[start] = 1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w, y = (p - x) / w
      area++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
      }
    }
    if (area >= minArea) { areas.push(area); boxes.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, area }) }
    else specks++
  }
  const foreground = areas.reduce((a, b) => a + b, 0)
  return { subjects: areas.length, specks, boxes, foregroundFraction: foreground / (w * h) }
}

export function crop(img: Rgba, x: number, y: number, width: number, height: number): Rgba {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y))
  width = Math.min(Math.floor(width), img.width - x); height = Math.min(Math.floor(height), img.height - y)
  if (width < 1 || height < 1) throw new Error('crop rectangle is outside the image')
  const out = makeRgba(width, height)
  for (let row = 0; row < height; row++) {
    const src = ((y + row) * img.width + x) * 4
    out.data.set(img.data.subarray(src, src + width * 4), row * width * 4)
  }
  return out
}

/** Flood-fill from the border, clearing pixels within `tolerance` (0-255, max channel delta) of the border colour. */
export function removeBackground(img: Rgba, tolerance = 24): Rgba {
  const { width: w, height: h } = img
  const out: Rgba = { width: w, height: h, data: new Uint8ClampedArray(img.data) }
  const bg = borderColor(img)
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const tryPush = (p: number) => {
    if (seen[p]) return
    seen[p] = 1
    if (dist(img.data, p * 4, bg) <= tolerance || img.data[p * 4 + 3] < ALPHA_VISIBLE) stack.push(p)
  }
  for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1) }
  while (stack.length) {
    const p = stack.pop()!
    out.data[p * 4 + 3] = 0
    const x = p % w, y = (p - x) / w
    if (x > 0) tryPush(p - 1); if (x < w - 1) tryPush(p + 1)
    if (y > 0) tryPush(p - w); if (y < h - 1) tryPush(p + w)
  }
  return out
}

/** Tight box around visible pixels (alpha >= ALPHA_VISIBLE); null when fully transparent. */
export function visibleBounds(img: Rgba) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] >= ALPHA_VISIBLE) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/** Trim to the visible subject, then add a transparent margin (fraction of the long side); optionally square. */
export function pad(img: Rgba, marginFraction = 0.1, square = true): Rgba {
  const box = visibleBounds(img) ?? { x: 0, y: 0, width: img.width, height: img.height }
  const subject = crop(img, box.x, box.y, box.width, box.height)
  const margin = Math.round(Math.max(box.width, box.height) * marginFraction)
  let W = box.width + 2 * margin, H = box.height + 2 * margin
  if (square) W = H = Math.max(W, H)
  const out = makeRgba(W, H)
  const ox = Math.floor((W - box.width) / 2), oy = Math.floor((H - box.height) / 2)
  for (let row = 0; row < box.height; row++) {
    out.data.set(subject.data.subarray(row * box.width * 4, (row + 1) * box.width * 4), ((oy + row) * W + ox) * 4)
  }
  return out
}

/** Area-average downscale so the long side is at most maxSide (never upscales). */
export function resize(img: Rgba, maxSide: number): Rgba {
  const k = maxSide / Math.max(img.width, img.height)
  if (k >= 1) return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  const W = Math.max(1, Math.round(img.width * k)), H = Math.max(1, Math.round(img.height * k))
  const out = makeRgba(W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx0 = Math.floor(x / k), sx1 = Math.min(img.width, Math.ceil((x + 1) / k))
    const sy0 = Math.floor(y / k), sy1 = Math.min(img.height, Math.ceil((y + 1) / k))
    let r = 0, g = 0, b = 0, a = 0, n = 0
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const i = (sy * img.width + sx) * 4
      const al = img.data[i + 3]
      // premultiplied so transparent pixels don't bleed their colour into edges
      r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al; a += al; n++
    }
    const o = (y * W + x) * 4
    out.data[o] = a ? r / a : 0; out.data[o + 1] = a ? g / a : 0; out.data[o + 2] = a ? b / a : 0; out.data[o + 3] = n ? a / n : 0
  }
  return out
}

/** Validate an op list before running it (also used server-side on the recorded params). */
export function validateOps(ops: unknown): ops is PrepOp[] {
  if (!Array.isArray(ops) || ops.length > 16) return false
  const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  return ops.every((o) => {
    if (!o || typeof o !== 'object') return false
    const p = o as Record<string, unknown>
    switch (p.op) {
      case 'crop': return num(p.x, 0, 1e5) && num(p.y, 0, 1e5) && num(p.width, 1, 1e5) && num(p.height, 1, 1e5)
      case 'remove-background': return num(p.tolerance, 0, 255)
      case 'pad': return num(p.marginFraction, 0, 1) && typeof p.square === 'boolean'
      case 'resize': return num(p.maxSide, 16, 8192)
      default: return false
    }
  })
}

export function applyOps(img: Rgba, ops: PrepOp[]): Rgba {
  return ops.reduce((cur, o) => {
    switch (o.op) {
      case 'crop': return crop(cur, o.x, o.y, o.width, o.height)
      case 'remove-background': return removeBackground(cur, o.tolerance)
      case 'pad': return pad(cur, o.marginFraction, o.square)
      case 'resize': return resize(cur, o.maxSide)
    }
  }, img)
}

/** Pixel-level checks that complement the header checks in imageInfo.ts. */
export function analysePixels(img: Rgba) {
  const alpha = alphaStats(img)
  const subjects = countSubjects(img)
  const issues: { level: 'error' | 'warning'; code: string; message: string }[] = []
  if (subjects.subjects === 0) issues.push({ level: 'error', code: 'no-subject', message: 'No subject found: the image is empty or matches its border colour.' })
  else if (subjects.subjects > 1) issues.push({ level: 'warning', code: 'multi-subject', message: `${subjects.subjects} separate subjects found. Standard models one object: crop to one, or set a subject name (multi-subject mode).` })
  if (subjects.foregroundFraction > 0.95) issues.push({ level: 'warning', code: 'fills-frame', message: 'Subject fills the frame; the edges may be cut off. Pad it.' })
  if (subjects.foregroundFraction > 0 && subjects.foregroundFraction < 0.05) issues.push({ level: 'warning', code: 'tiny-subject', message: 'Subject covers under 5% of the image; crop closer.' })
  return { alpha, subjects, issues }
}
