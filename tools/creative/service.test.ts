import { mkdtemp, readFile, writeFile, stat, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import { Library, LibraryError } from './library.ts'
import { Ledger, ProjectSimClient, readToken, stripUrls, tokenStatus } from './projectsim.ts'
import { CreativeService, pickGlb } from './service.ts'
import { decodePng, encodePng } from './png.ts'
import { makeRgba } from '../../src/creative/pixels.ts'
import { quadGltf, tinyPng, packGlb, jpegHeader } from '../../src/creative/testing/fixtures.ts'

const OK = { phrase: 'SPEND 4 CREDITS', acknowledgeCredits: true, acknowledgeLicence: true, confirmNoCardOnFile: true }

/** 1200×1000 artwork: one red blob on white (no alpha) -> a real PNG the server can decode. */
function artwork(two = false) {
  const img = makeRgba(1200, 1000, [255, 255, 255, 255])
  const blob = (x0: number, y0: number) => { for (let y = y0; y < y0 + 300; y++) for (let x = x0; x < x0 + 300; x++) img.data.set([220, 30, 30, 255], (y * 1200 + x) * 4) }
  blob(200, 300)
  if (two) blob(800, 300)
  return img
}

/** Prepared copy: same blob, transparent background, square. */
function prepared(two = false) {
  const img = makeRgba(1024, 1024)
  const blob = (x0: number) => { for (let y = 300; y < 700; y++) for (let x = x0; x < x0 + 300; x++) img.data.set([220, 30, 30, 255], (y * 1024 + x) * 4) }
  blob(two ? 100 : 360)
  if (two) blob(600)
  return encodePng(img)
}

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

function fakeFetch(opts: { createStatus?: number; jobStatus?: string; files?: Record<string, Uint8Array>; kinds?: Record<string, string> } = {}) {
  const calls: Call[] = []
  const files = opts.files ?? { 'model.glb': quadGltf({ texture: 'embedded' }).glb }
  const impl = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input)
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    calls.push({ url, method: init.method ?? 'GET', headers, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/v1/uploads')) return json(201, { uploads: [{ id: 'upl_1', url: 'https://s3.example/bucket', fields: { key: 'k', policy: 'p' }, max_bytes: 524288000, expires_at: '' }] })
    if (url === 'https://s3.example/bucket') return new Response(null, { status: 204 })
    if (url.endsWith('/v1/assets/standard')) return opts.createStatus && opts.createStatus !== 202 ? json(opts.createStatus, { title: 'Payment required' }) : json(202, { id: 'ast_1', job_id: 'job_1', status: 'queued' })
    if (url.endsWith('/v1/assets/ast_1')) {
      const st = opts.jobStatus ?? 'complete'
      return json(200, { id: 'ast_1', job: { status: st }, files: st === 'complete' ? Object.keys(files).map((p) => ({ path: p, url: `https://cdn.example/${p}?sig=SECRET`, kind: opts.kinds?.[p] })) : [] })
    }
    const m = /^https:\/\/cdn\.example\/(.+)\?sig=SECRET$/.exec(url)
    if (m && files[m[1]]) return new Response(files[m[1]] as BodyInit, { status: 200 })
    return json(404, { title: 'not found' })
  }) as typeof fetch
  return { impl, calls }
}

let root: string
let lib: Library
let ledger: Ledger
let px4Ledger: string

async function setup(env: Record<string, string> = {}, fetchOpts: Parameters<typeof fakeFetch>[0] = {}) {
  const ff = fakeFetch(fetchOpts)
  let constructed = 0
  const svc = new CreativeService({
    library: lib, ledger, externalLedgers: [px4Ledger], env, now: () => new Date('2026-10-21T12:00:00Z'),
    clientFactory: async () => { constructed++; return new ProjectSimClient('kps_test_token', ff.impl) },
  })
  const { manifest } = await lib.importOriginal(encodePng(artwork()), { sourceName: 'dragon.png', title: 'Red Dragon' })
  const withPrep = await lib.addPreparation(manifest.id, prepared(), { parent: 'original', ops: [{ op: 'remove-background', tolerance: 24 }, { op: 'pad', marginFraction: 0.1, square: true }] })
  return { svc, ff, id: manifest.id, prepId: withPrep.preparations[0].id, constructed: () => constructed }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rf-creative-'))
  lib = new Library(path.join(root, 'lib'), () => new Date('2026-10-21T12:00:00Z'))
  ledger = new Ledger(path.join(root, 'lib', 'ledger.jsonl'))
  px4Ledger = path.join(root, 'px4_ledger.jsonl')
  // The real PX4 ledger shape: E1 procedural set, 10 credits.
  await writeFile(px4Ledger, [
    { utc: '2026-10-21T17:31:22+00:00', event: 'intent', key: 'plan-6a66', item: 'e1_shelving_bays', credits: 10, endpoint: 'procedural' },
    { utc: '2026-10-21T17:31:23+00:00', event: 'submitted', key: 'plan-6a66', item: 'e1_shelving_bays', credits: 10, job_id: 'job_x', set_id: 'vset_x' },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
})

describe('library: originals, derived copies, versioned manifests', () => {
  it('stores the original byte-for-byte, read-only, and dedupes re-imports', async () => {
    const bytes = encodePng(artwork())
    const { manifest, duplicate } = await lib.importOriginal(bytes, { sourceName: '/home/me/art/dragon.png', title: 'Red Dragon' })
    expect(duplicate).toBe(false)
    expect(manifest).toMatchObject({ revision: 1, id: expect.stringMatching(/^red-dragon-[0-9a-f]{8}$/), original: { format: 'png', width: 1200, height: 1000, sourceName: 'dragon.png' } })
    const file = lib.resolve(manifest.id, manifest.original.file)
    expect(new Uint8Array(await readFile(file))).toEqual(bytes)
    expect((await stat(file)).mode & 0o222).toBe(0)
    expect((await lib.importOriginal(bytes, { sourceName: 'again.png' })).duplicate).toBe(true)
    expect(manifest.original.alphaChannel).toBe(true) // encodePng writes RGBA
    const jpg = await lib.importOriginal(jpegHeader(2000, 1500), { sourceName: 'photo.jpg' })
    expect(jpg.manifest.original).toMatchObject({ format: 'jpeg', alphaChannel: false, file: expect.stringMatching(/\.jpg$/) })
    expect(jpg.manifest.original.issues.map((i) => i.code)).toContain('no-alpha')
  })

  it('rejects non-images and oversize pixels', async () => {
    await expect(lib.importOriginal(new TextEncoder().encode('hello'), { sourceName: 'x.png' })).rejects.toThrow(LibraryError)
  })

  it('records preparations with server-recomputed analysis and keeps history of every revision', async () => {
    const { manifest } = await lib.importOriginal(encodePng(artwork()), { sourceName: 'd.png' })
    const m2 = await lib.addPreparation(manifest.id, prepared(true), { parent: 'original', ops: [{ op: 'resize', maxSide: 1024 }] })
    expect(m2.revision).toBe(2)
    expect(m2.preparations[0]).toMatchObject({ parent: 'original', width: 1024, height: 1024, analysis: { subjects: 2 } })
    expect(m2.preparations[0].issues.map((i) => i.code)).toContain('multi-subject')
    expect(existsSync(path.join(lib.dir(manifest.id), 'history', 'r0001.json'))).toBe(true)
    await expect(lib.addPreparation(manifest.id, prepared(), { parent: 'prep-nope', ops: [] })).rejects.toThrow(/unknown parent/)
    await expect(lib.addPreparation(manifest.id, prepared(), { parent: 'original', ops: [{ op: 'eval' }] as never })).rejects.toThrow(/invalid preparation ops/)
    await expect(lib.addPreparation(manifest.id, tinyPng().subarray(0, 20), { parent: 'original', ops: [] })).rejects.toThrow()
    expect((await lib.verify(manifest.id)).every((v) => v.ok && v.readOnly)).toBe(true)
  })

  it('refuses stale writes and paths that escape the asset folder', async () => {
    const { manifest } = await lib.importOriginal(encodePng(artwork()), { sourceName: 'd.png' })
    await expect(lib.save(manifest, 0)).rejects.toThrow(/changed/)
    expect(() => lib.resolve(manifest.id, '../../../etc/passwd')).toThrow(/escapes/)
    expect(() => lib.dir('../x')).toThrow(/invalid asset id/)
  })

  it('png codec round-trips RGBA', () => {
    const img = artwork()
    const back = decodePng(encodePng(img))
    expect([back.width, back.height]).toEqual([1200, 1000])
    expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true)
  })
})

describe('conversion gate', () => {
  it('stores a valid GLB and records triangles, extents and textures', async () => {
    const { manifest } = await lib.importOriginal(encodePng(artwork()), { sourceName: 'd.png' })
    const { manifest: m, report } = await lib.setConvertedGlb(manifest.id, quadGltf({ w: 2, h: 1, texture: 'embedded' }).glb, { from: 'test', generationId: null })
    expect(report.ok).toBe(true)
    expect(m.converted).toMatchObject({ file: 'converted/model-1.glb', triangles: 2, extents: [2, 1, 0], textures: [{ embedded: true }] })
  })

  it('rejects invalid meshes and missing textures without storing anything', async () => {
    const { manifest } = await lib.importOriginal(encodePng(artwork()), { sourceName: 'd.png' })
    await expect(lib.setConvertedGlb(manifest.id, quadGltf({ nan: true }).glb, { from: 't', generationId: null })).rejects.toMatchObject({ status: 422 })
    await expect(lib.setConvertedGlb(manifest.id, quadGltf({ texture: 'external' }).glb, { from: 't', generationId: null })).rejects.toMatchObject({ details: { errors: [expect.stringMatching(/missing texture/)] } })
    await expect(lib.setConvertedGlb(manifest.id, new TextEncoder().encode('{"asset":{"version":"2.0"}}'), { from: 't', generationId: null })).rejects.toThrow()
    expect((await lib.get(manifest.id)).converted).toBeNull()
  })
})

describe('dry-run never spends', () => {
  it('validates, prices and records without any network call', async () => {
    const { svc, ff, id, prepId, constructed } = await setup()
    const r = await svc.dryRun(id, prepId, { name: 'Red Dragon' })
    expect(ff.calls).toEqual([])
    expect(constructed()).toBe(0)
    expect(r.generation).toMatchObject({ status: 'validated', credits: 4, dryRun: { ok: true, budgetAvailable: 24 } })
    expect(r.preview).toMatchObject({ credits: 4, budgetBefore: 24, budgetAfter: 20, approvalPhrase: 'SPEND 4 CREDITS', spendEnabledOnServer: false })
    expect(r.preview.body.inputs.images).toEqual([{ upload_id: '<minted-at-submit>' }])
    expect(await ledger.entries()).toEqual([])
  })

  it('rejects a multi-subject preparation', async () => {
    const { svc, id } = await setup()
    const m = await lib.addPreparation(id, prepared(true), { parent: 'original', ops: [] })
    const r = await svc.dryRun(id, m.preparations[1].id, { name: 'x' })
    expect(r.generation.status).toBe('rejected')
    expect(r.generation.dryRun.issues.map((i) => i.code)).toContain('multi-subject')
  })

  it('reports the account budget across both ledgers', async () => {
    const { svc } = await setup()
    expect(await svc.budget()).toMatchObject({ externalCommitted: 10, accountCommitted: 10, accountSpendable: 88, creativeRemaining: 24, available: 24 })
  })
})

describe('approval + submit enforcement', () => {
  it('refuses to submit without CREATIVE_ALLOW_SPEND=1, even when approved', async () => {
    const { svc, ff, id, prepId } = await setup({})
    const { generation } = await svc.dryRun(id, prepId, { name: 'x' })
    await svc.approve(id, generation.id, OK)
    await expect(svc.submit(id, generation.id)).rejects.toThrow(/spending is disabled/)
    expect(ff.calls).toEqual([])
    expect(await ledger.entries()).toEqual([])
  })

  it('refuses to submit an unapproved generation even with spend enabled', async () => {
    const { svc, ff, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' })
    const { generation } = await svc.dryRun(id, prepId, { name: 'x' })
    await expect(svc.submit(id, generation.id)).rejects.toThrow(/not approved/)
    await expect(svc.approve(id, generation.id, { ...OK, phrase: 'yes' })).rejects.toThrow(/type exactly/)
    expect(ff.calls).toEqual([])
  })

  it('refuses when the request was edited after approval', async () => {
    const { svc, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' })
    const { generation } = await svc.dryRun(id, prepId, { name: 'x' })
    const m = await svc.approve(id, generation.id, OK)
    const tampered = structuredClone(m)
    tampered.generations[0].request.inputs.text = 'make it gold'
    await lib.save(tampered, m.revision)
    await expect(svc.submit(id, generation.id)).rejects.toThrow(/payload changed/)
  })

  it('happy path: ledger intent before the paid POST, idempotency key, then download + ingest', async () => {
    const { svc, ff, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' })
    const { generation } = await svc.dryRun(id, prepId, { name: 'Red Dragon' })
    await svc.approve(id, generation.id, OK)
    const m = await svc.submit(id, generation.id)
    expect(m.generations[0]).toMatchObject({ status: 'submitted', submission: { uploadId: 'upl_1', jobId: 'job_1', providerAssetId: 'ast_1' } })
    expect(m.licence.provider?.giftCreditOutputsPaid).toBe('unconfirmed')
    const create = ff.calls.find((c) => c.url.endsWith('/v1/assets/standard'))!
    expect(create.headers['Idempotency-Key']).toBe(generation.idempotencyKey)
    expect(create.headers.Authorization).toBe('Bearer kps_test_token')
    expect((create.body as { inputs: unknown }).inputs).toEqual({ images: [{ upload_id: 'upl_1' }] })
    const s3 = ff.calls.find((c) => c.url.startsWith('https://s3.'))!
    expect(s3.headers.Authorization).toBeUndefined()
    expect((await ledger.entries()).map((e) => e.event)).toEqual(['intent', 'submitted'])
    expect((await svc.budget()).creativeCommitted).toBe(4)
    await expect(svc.submit(id, generation.id)).rejects.toThrow(/already submitted/)

    const r = await svc.refresh(id, generation.id)
    expect(r.status).toBe('complete')
    expect(r.manifest.converted).toMatchObject({ file: 'converted/model-1.glb', generationId: generation.id, triangles: 2 })
    const meta = await readFile(lib.resolve(id, r.manifest.generations[0].provider!.metadataFile), 'utf8')
    expect(meta).not.toContain('SECRET')
    const dl = ff.calls.filter((c) => c.url.startsWith('https://cdn.'))
    expect(dl.every((c) => !c.headers.Authorization)).toBe(true)
  })

  it('records a refund when the provider rejects the create (nothing created)', async () => {
    const { svc, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' }, { createStatus: 402 })
    const { generation } = await svc.dryRun(id, prepId, { name: 'x' })
    await svc.approve(id, generation.id, OK)
    await expect(svc.submit(id, generation.id)).rejects.toThrow(/HTTP 402/)
    expect((await ledger.entries()).map((e) => e.event)).toEqual(['intent', 'refunded'])
    expect((await svc.budget()).creativeCommitted).toBe(0)
    expect((await lib.get(id)).generations[0].status).toBe('failed')
  })

  it('refunds a failed job and keeps an invalid provider GLB out of the library', async () => {
    const failed = await setup({ CREATIVE_ALLOW_SPEND: '1' }, { jobStatus: 'failed' })
    const g1 = (await failed.svc.dryRun(failed.id, failed.prepId, { name: 'x' })).generation
    await failed.svc.approve(failed.id, g1.id, OK)
    await failed.svc.submit(failed.id, g1.id)
    expect((await failed.svc.refresh(failed.id, g1.id)).status).toBe('failed')
    expect((await failed.svc.budget()).creativeCommitted).toBe(0)
  })

  it('rejects a provider GLB with a missing texture but keeps the raw output', async () => {
    const { json, bin } = quadGltf({ texture: 'external' })
    const { svc, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' }, { files: { 'out/model.glb': packGlb(json, bin) } })
    const { generation } = await svc.dryRun(id, prepId, { name: 'x' })
    await svc.approve(id, generation.id, OK)
    await svc.submit(id, generation.id)
    await expect(svc.refresh(id, generation.id)).rejects.toMatchObject({ status: 422 })
    const m = await lib.get(id)
    expect(m.converted).toBeNull()
    expect(m.generations[0].provider?.files['out/model.glb']).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses when the creative allocation is used up', async () => {
    const { svc, id, prepId } = await setup({ CREATIVE_ALLOW_SPEND: '1' })
    for (let i = 0; i < 6; i++) await ledger.record('intent', { key: `k${i}`, credits: 4 })
    const r = await svc.dryRun(id, prepId, { name: 'x' })
    expect(r.generation.status).toBe('rejected')
    expect(r.generation.dryRun.issues.find((i) => i.code === 'budget')?.message).toMatch(/creative allocation/)
  })
})

describe('provider helpers', () => {
  it('picks the GLB by kind, then extension', () => {
    expect(pickGlb([{ path: 'a.fbx', kind: 'fbx' }, { path: 'b.glb', kind: 'glb' }])).toBe('b.glb')
    expect(pickGlb([{ path: 'x/model.GLB' }])).toBe('x/model.GLB')
    expect(() => pickGlb([{ path: 'a.usd', kind: 'usd' }])).toThrow(/agnostic/)
  })

  it('strips presigned URLs and signed fields', () => {
    expect(stripUrls({ files: [{ path: 'a', url: 'https://x?sig' }], fields: { policy: 'p' }, id: 1 })).toEqual({ files: [{ path: 'a' }], id: 1 })
  })

  it('never exposes the token, and refuses a world-readable token file', async () => {
    const c = new ProjectSimClient('kps_secret_value', fakeFetch().impl)
    expect(JSON.stringify({ c })).not.toContain('kps_secret_value')
    expect(() => new ProjectSimClient('sk_wrong')).toThrow()
    const f = path.join(root, 'token')
    await writeFile(f, 'kps_abc\n')
    await chmod(f, 0o644)
    await expect(readToken({}, f)).rejects.toThrow(/chmod 600/)
    await chmod(f, 0o600)
    expect(await readToken({}, f)).toBe('kps_abc')
    const status = await tokenStatus({ PROJECTSIM_TOKEN_FILE: f })
    expect(status).toEqual({ configured: true, looksValid: true, source: 'file' })
    expect(JSON.stringify(status)).not.toContain('kps_abc')
  })
})
