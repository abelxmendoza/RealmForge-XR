import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readImageInfo, validateImageBytes, hasErrors } from './imageInfo'
import { alphaStats, analysePixels, applyOps, countSubjects, crop, makeRgba, pad, removeBackground, resize, validateOps, visibleBounds, type Rgba } from './pixels'
import { assertAffordable, budgetStatus, BudgetExceeded, committed, costOf, DEFAULT_BUDGET, type LedgerEntry } from './credits'
import { approve, ApprovalError, approvalPhrase, assertSubmittable, buildStandardRequest, canonicalJson, payloadDigestInput, validateStandardRequest, APPROVAL_TTL_MS } from './generation'
import { inspectGltf } from './glb'
import { validateManifest, type Generation } from './manifest'
import { jpegHeader, packGlb, pngHeader, quadGltf, tinyPng, webpVp8xHeader } from './testing/fixtures'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function paint(img: Rgba, x0: number, y0: number, w: number, h: number, c: [number, number, number, number]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.data.set(c, (y * img.width + x) * 4)
}

describe('image validation', () => {
  it('reads PNG / JPEG / WebP headers by content', () => {
    expect(readImageInfo(pngHeader(1024, 768, 6))).toEqual({ format: 'png', width: 1024, height: 768, alphaChannel: true })
    expect(readImageInfo(pngHeader(1024, 768, 2))?.alphaChannel).toBe(false)
    expect(readImageInfo(pngHeader(64, 64, 3, 'tRNS'))?.alphaChannel).toBe(true) // palette + tRNS
    expect(readImageInfo(jpegHeader(2000, 1500))).toEqual({ format: 'jpeg', width: 2000, height: 1500, alphaChannel: false })
    expect(readImageInfo(webpVp8xHeader(1200, 900, true))).toEqual({ format: 'webp', width: 1200, height: 900, alphaChannel: true })
    expect(readImageInfo(tinyPng())).toMatchObject({ format: 'png', width: 1, height: 1 })
  })

  it('rejects non-images regardless of name, and oversize pixels', () => {
    expect(hasErrors(validateImageBytes(new TextEncoder().encode('GIF89a not supported')).issues)).toBe(true)
    expect(hasErrors(validateImageBytes(pngHeader(9000, 9000)).issues)).toBe(true)
  })

  it('warns on low resolution, extreme aspect and missing alpha without blocking', () => {
    const { issues } = validateImageBytes(jpegHeader(400, 2000))
    expect(hasErrors(issues)).toBe(false)
    expect(issues.map((i) => i.code).sort()).toEqual(['aspect', 'low-res', 'no-alpha'])
    expect(validateImageBytes(pngHeader(2048, 2048, 6)).issues).toEqual([])
  })
})

describe('pixel preparation (non-destructive)', () => {
  const scene = () => {
    const img = makeRgba(100, 80, [250, 250, 250, 255]) // plain white backdrop
    paint(img, 20, 20, 30, 40, [200, 40, 40, 255])
    return img
  }

  it('counts one subject on a plain backdrop and two separated ones', () => {
    expect(countSubjects(scene()).subjects).toBe(1)
    const two = scene()
    paint(two, 70, 10, 20, 20, [20, 40, 200, 255])
    expect(countSubjects(two).subjects).toBe(2)
    const speck = scene()
    paint(speck, 90, 70, 2, 2, [0, 0, 0, 255])
    expect(countSubjects(speck)).toMatchObject({ subjects: 1, specks: 1 })
  })

  it('uses alpha for subject detection when the image is transparent', () => {
    const img = makeRgba(50, 50)
    paint(img, 10, 10, 10, 10, [255, 255, 255, 255])
    expect(alphaStats(img).usesAlpha).toBe(true)
    expect(countSubjects(img).subjects).toBe(1)
  })

  it('removes a plain background without touching the input buffer', () => {
    const src = scene()
    const before = new Uint8ClampedArray(src.data)
    const out = removeBackground(src, 24)
    expect(src.data).toEqual(before)
    expect(out.data[3]).toBe(0) // corner cleared
    expect(out.data[(30 * 100 + 30) * 4 + 3]).toBe(255) // subject kept
    expect(visibleBounds(out)).toEqual({ x: 20, y: 20, width: 30, height: 40 })
  })

  it('crops, pads to a centred square and downsizes', () => {
    const cut = removeBackground(scene(), 24)
    const padded = pad(cut, 0.1, true)
    expect(padded.width).toBe(padded.height)
    expect(padded.width).toBe(48) // 40 + 2*4
    const b = visibleBounds(padded)!
    expect([b.width, b.height]).toEqual([30, 40])
    expect(resize(padded, 24)).toMatchObject({ width: 24, height: 24 })
    expect(resize(padded, 1000).width).toBe(48) // never upscales
    expect(crop(scene(), 10, 10, 20, 20)).toMatchObject({ width: 20, height: 20 })
    expect(() => crop(scene(), 200, 200, 5, 5)).toThrow()
  })

  it('validates op lists and applies them in order', () => {
    const ops = [{ op: 'remove-background', tolerance: 24 }, { op: 'pad', marginFraction: 0.1, square: true }, { op: 'resize', maxSide: 32 }]
    expect(validateOps(ops)).toBe(true)
    expect(validateOps([{ op: 'rm -rf' }])).toBe(false)
    expect(validateOps([{ op: 'resize', maxSide: 1e9 }])).toBe(false)
    expect(applyOps(scene(), ops as never)).toMatchObject({ width: 32, height: 32 })
  })

  it('flags empty images and multiple subjects', () => {
    expect(analysePixels(makeRgba(20, 20, [9, 9, 9, 255])).issues[0].code).toBe('no-subject')
    const two = scene()
    paint(two, 70, 10, 20, 20, [20, 40, 200, 255])
    expect(analysePixels(two).issues.map((i) => i.code)).toContain('multi-subject')
  })
})

describe('credit accounting', () => {
  const e = (event: string, key: string, credits?: number): LedgerEntry => ({ utc: '2026-10-21T00:00:00Z', event, key, ...(credits !== undefined ? { credits } : {}) })

  it('prices Standard at 4 and procedural per member', () => {
    expect(costOf('standard')).toBe(4)
    expect(costOf('procedural', 10)).toBe(10)
  })

  it('counts intents as spent until refunded, including partial refunds', () => {
    expect(committed([e('intent', 'a', 4), e('submitted', 'a', 4)])).toBe(4)
    expect(committed([e('intent', 'a', 4), e('refunded', 'a')])).toBe(0)
    expect(committed([e('intent', 's', 10), e('refunded', 's', 3)])).toBe(7)
    expect(committed([e('refunded', 'orphan', 5)])).toBe(0)
  })

  it('reads the PX4 ledger format and enforces both the creative allocation and the account holdback', () => {
    const px4 = [e('intent', 'e1', 10), e('submitted', 'e1', 10)]
    const s = budgetStatus([], [px4])
    expect(s).toMatchObject({ accountCommitted: 10, creativeRemaining: 24, accountSpendable: 120 - 22 - 10, available: 24 })
    assertAffordable(4, s)
    const creative = [1, 2, 3, 4, 5, 6].map((i) => e('intent', `c${i}`, 4))
    expect(() => assertAffordable(4, budgetStatus(creative, [px4]))).toThrow(BudgetExceeded)
    const bigRobotics = [e('intent', 'b', 86)] // 86 + 10 = 96 of 98 spendable
    expect(() => assertAffordable(4, budgetStatus([], [px4, bigRobotics]))).toThrow(/contingency/)
    expect(() => assertAffordable(0, s)).toThrow()
    expect(DEFAULT_BUDGET.expires).toBe('2026-11-18')
  })
})

describe('dry-run and approval enforcement', () => {
  const image = { bytes: 500_000, issues: [], mime: 'image/png', subjects: 1 }
  const draft = (over: Partial<Generation> = {}): Generation => {
    const request = buildStandardRequest({ name: 'Dragon' })
    const payloadHash = sha(payloadDigestInput('standard', request, 'f'.repeat(64)))
    return {
      id: 'gen-1', createdAt: '', endpoint: 'standard', preparationId: 'prep-1', imageSha256: 'f'.repeat(64), credits: 4,
      status: 'validated', request, payloadHash, idempotencyKey: `rf-${payloadHash.slice(0, 40)}`,
      dryRun: { at: '', ok: true, issues: [], budgetAvailable: 24 }, approval: null, submission: null, provider: null, ...over,
    }
  }
  const ok = { phrase: 'SPEND 4 CREDITS', acknowledgeCredits: true, acknowledgeLicence: true, confirmNoCardOnFile: true }
  const now = new Date('2026-10-21T12:00:00Z')

  it('builds a single-image agnostic request and validates it', () => {
    const req = buildStandardRequest({ name: ' Dragon ', text: '  ' })
    expect(req.inputs).toEqual({ images: [{ upload_id: '<minted-at-submit>' }] })
    expect(req.params.physics).toMatchObject({ simulator: 'agnostic', articulated: false, collision_granularity: null })
    expect(validateStandardRequest(req, image)).toEqual([])
  })

  it('rejects multi-view, multi-subject without a name, wrong simulator and bad mime', () => {
    const req = buildStandardRequest({ name: 'x' })
    ;(req.inputs.images as unknown as unknown[]).push({ upload_id: 'b' })
    const codes = validateStandardRequest(req, { ...image, subjects: 2, mime: 'image/gif' }).map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['images', 'multi-subject', 'mime']))
    const isaac = buildStandardRequest({ name: 'x' })
    isaac.params.physics.simulator = 'isaac_sim_physx'
    expect(validateStandardRequest(isaac, image).map((i) => i.code)).toContain('simulator')
    const named = buildStandardRequest({ name: 'x', subjectName: 'red dragon' })
    expect(validateStandardRequest(named, { ...image, subjects: 3 }).filter((i) => i.level === 'error')).toEqual([])
  })

  it('warns that text with an image becomes edit instructions', () => {
    const req = buildStandardRequest({ name: 'x', text: 'make it blue' })
    expect(validateStandardRequest(req, image).find((i) => i.code === 'text-edits')?.level).toBe('warning')
  })

  it('hashes canonically (key order does not matter)', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, 2] }, b: 1 }))
  })

  it('requires the exact phrase and all three acknowledgements', () => {
    expect(approvalPhrase(4)).toBe('SPEND 4 CREDITS')
    expect(() => approve(draft(), { ...ok, phrase: 'spend 4 credits' }, now)).toThrow(ApprovalError)
    expect(() => approve(draft(), { ...ok, phrase: 'SPEND 1 CREDITS' }, now)).toThrow(/type exactly/)
    expect(() => approve(draft(), { ...ok, acknowledgeLicence: false }, now)).toThrow(/licence/)
    expect(() => approve(draft(), { ...ok, confirmNoCardOnFile: false }, now)).toThrow(/card/)
    expect(() => approve(draft(), { ...ok, acknowledgeCredits: false }, now)).toThrow(/credit/)
    expect(() => approve(draft({ dryRun: { at: '', ok: false, issues: [], budgetAvailable: 0 } }), ok, now)).toThrow(/dry-run/)
    expect(() => approve(draft({ status: 'submitted' }), ok, now)).toThrow(/only a validated/)
  })

  it('refuses submit without approval, after payload change, after expiry or twice', () => {
    const g = draft()
    expect(() => assertSubmittable(g, g.payloadHash, now)).toThrow(/not approved/)
    const approved = { ...g, status: 'approved' as const, approval: approve(g, ok, now) }
    expect(() => assertSubmittable(approved, g.payloadHash, now)).not.toThrow()
    expect(() => assertSubmittable(approved, 'other-hash', now)).toThrow(/payload changed/)
    expect(() => assertSubmittable(approved, g.payloadHash, new Date(now.getTime() + APPROVAL_TTL_MS + 1))).toThrow(/expired/)
    expect(() => assertSubmittable({ ...approved, credits: 1 }, g.payloadHash, now)).toThrow(/credit/)
    const sent = { ...approved, submission: { at: '', uploadId: 'u', jobId: 'j', providerAssetId: 'a' } }
    expect(() => assertSubmittable(sent, g.payloadHash, now)).toThrow(/already submitted/)
  })
})

describe('GLB / glTF conversion gate', () => {
  it('accepts a valid GLB and measures it in world space', () => {
    const r = inspectGltf(quadGltf({ w: 1.5, h: 0.75, translation: [10, 0, 0] }).glb)
    expect(r).toMatchObject({ ok: true, container: 'glb', triangles: 2, meshes: 1, extents: [1.5, 0.75, 0] })
    expect(r.bounds?.min[0]).toBe(10)
  })

  it('reports embedded textures', () => {
    const r = inspectGltf(quadGltf({ texture: 'embedded' }).glb)
    expect(r.ok).toBe(true)
    expect(r.textures).toEqual([{ name: 'base_color', mimeType: 'image/png', embedded: true, bytes: 69 }])
  })

  it('fails on a missing external texture and passes when the resolver finds it', () => {
    const { glb } = quadGltf({ texture: 'external' })
    const missing = inspectGltf(glb)
    expect(missing.ok).toBe(false)
    expect(missing.errors.join()).toMatch(/missing texture textures\/base_color\.png/)
    const found = inspectGltf(glb, (uri) => (uri === 'textures/base_color.png' ? tinyPng() : null))
    expect(found.ok).toBe(true)
    expect(found.textures[0]).toMatchObject({ embedded: false, mimeType: 'image/png' })
  })

  it('refuses textures/buffers pointing outside the asset folder', () => {
    const { json, bin } = quadGltf({ texture: 'external' })
    json.images[0].uri = '../../etc/passwd.png'
    expect(inspectGltf(packGlb(json, bin), () => tinyPng()).errors.join()).toMatch(/missing texture/)
  })

  it('rejects invalid meshes: truncated, bad magic, NaN vertices, out-of-range accessors, no triangles', () => {
    const { glb, json, bin } = quadGltf()
    expect(inspectGltf(glb.subarray(0, glb.length - 8)).errors.join()).toMatch(/truncated/)
    const bad = new Uint8Array(glb); bad[0] = 0x67; bad[1] = 0x6c; bad[2] = 0x54; bad[3] = 0x47
    expect(inspectGltf(bad).ok).toBe(false)
    expect(inspectGltf(quadGltf({ nan: true }).glb).errors.join()).toMatch(/non-finite/)
    const oob = structuredClone(json); oob.accessors[2].count = 600
    expect(inspectGltf(packGlb(oob, bin)).errors.join()).toMatch(/accessors\[2\]/)
    const empty = structuredClone(json); empty.meshes = []
    expect(inspectGltf(packGlb(empty, bin)).errors).toContain('no meshes')
    const v1 = structuredClone(json); v1.asset.version = '1.0'
    expect(inspectGltf(packGlb(v1, bin)).ok).toBe(false)
    const badMat = structuredClone(json); badMat.meshes[0].primitives[0].material = 7
    expect(inspectGltf(packGlb(badMat, bin)).errors.join()).toMatch(/material 7/)
  })
})

describe('manifest metadata', () => {
  const valid = () => ({
    format: 'realmforge-creative-asset', schemaVersion: 1, revision: 1, id: 'dragon-1', title: 'Dragon', createdAt: '', updatedAt: '',
    original: { file: `original/${'a'.repeat(64)}.png`, sha256: 'a'.repeat(64), bytes: 10, format: 'png', width: 1, height: 1, alphaChannel: true, sourceName: 'd.png', importedAt: '', issues: [] },
    preparations: [{ id: 'prep-1', parent: 'original', file: 'derived/prep-1.png', sha256: 'b'.repeat(64), bytes: 5, ops: [], width: 1, height: 1, analysis: {}, issues: [], createdAt: '' }],
    generations: [], converted: null, preview: null, licence: { origin: 'original-artwork', owner: 'me', notes: '' },
  })

  it('accepts a well-formed manifest', () => expect(validateManifest(valid())).toEqual([]))

  it('rejects wrong schema, escaping paths, broken lineage and unapproved submissions', () => {
    expect(validateManifest({ ...valid(), schemaVersion: 2 })).toContain('unsupported schemaVersion 2')
    const esc = valid(); esc.preparations[0].file = '../../x.png'
    expect(validateManifest(esc).join()).toMatch(/relative path/)
    const orphan = valid(); orphan.preparations[0].parent = 'nope'
    expect(validateManifest(orphan).join()).toMatch(/parent nope unknown/)
    const sneaky = valid() as ReturnType<typeof valid> & { generations: unknown[] }
    sneaky.generations = [{ preparationId: 'prep-1', status: 'submitted', approval: null, payloadHash: 'x' }] as never
    expect(validateManifest(sneaky).join()).toMatch(/submitted without approval/)
    const notOriginal = valid(); notOriginal.original.file = 'derived/x.png'
    expect(validateManifest(notOriginal).join()).toMatch(/original\//)
  })
})

describe('studio entry', () => {
  it('opens only on ?studio=1', async () => {
    const { isStudioEntry } = await import('./entry')
    expect(isStudioEntry('?studio=1')).toBe(true)
    expect(isStudioEntry('?studio=true')).toBe(false)
    expect(isStudioEntry('?editor=1')).toBe(false)
  })
})
