/**
 * Creative Studio service: dry-run -> approve -> submit -> refresh/ingest (Node only).
 *
 * Spend safety, enforced here and covered by tools/creative/service.test.ts:
 *   1. dryRun never touches the network.
 *   2. submit refuses unless the DEV SERVER's own environment has CREATIVE_ALLOW_SPEND=1 (the browser
 *      cannot set it; an automated agent working in the repo should not set it either).
 *   3. submit re-hashes the request + prepared image bytes from disk and requires a matching, unexpired
 *      human approval (src/creative/generation.ts).
 *   4. the budget (creative allocation AND account-wide holdback, summing the PX4 ledger read-only)
 *      is re-checked immediately before the spend.
 *   5. an `intent` ledger entry is appended BEFORE the credit-consuming POST; a 4xx rejection
 *      (nothing created) records a refund; a crash leaves the intent counted as spent.
 *   6. the Idempotency-Key is derived from the payload hash, so a retry replays instead of re-buying.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertAffordable, budgetStatus, costOf, DEFAULT_BUDGET, type Budget, type BudgetStatus } from '../../src/creative/credits.ts'
import { approve, approvalPhrase, assertSubmittable, buildStandardRequest, payloadDigestInput, validateStandardRequest, UPLOAD_PLACEHOLDER, type ApprovalInput, type GenerationOptions } from '../../src/creative/generation.ts'
import { MIME, type Issue } from '../../src/creative/imageInfo.ts'
import { KAEDIM_TERMS_SUMMARY, type AssetManifest, type Generation } from '../../src/creative/manifest.ts'
import { Library, LibraryError, sha256 } from './library.ts'
import { Ledger, ProjectSimClient, ProjectSimError, readExternalLedgers, stripUrls } from './projectsim.ts'

export const PROVIDER_TERMS = { name: 'ProjectSim (Kaedim)', termsUrl: 'https://projectsim.ai/terms', summary: KAEDIM_TERMS_SUMMARY, giftCreditOutputsPaid: 'unconfirmed' as const }
export const OVERAGE_WARNING = 'If a payment card is on file, going past the gift credits starts a $1,200/month plan. Confirm on the dashboard that no card is attached.'

export interface ServiceOptions {
  library: Library
  ledger: Ledger
  externalLedgers?: string[]
  budget?: Budget
  env?: NodeJS.ProcessEnv
  now?: () => Date
  /** Only constructed inside submit/refresh, after every local gate passed. */
  clientFactory?: () => Promise<ProjectSimClient>
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

export class CreativeService {
  readonly library: Library
  readonly ledger: Ledger
  private now: () => Date
  private o: ServiceOptions
  constructor(o: ServiceOptions) {
    this.o = o
    this.library = o.library
    this.ledger = o.ledger
    this.now = o.now ?? (() => new Date())
  }

  get env() { return this.o.env ?? process.env }

  spendEnabled() { return this.env.CREATIVE_ALLOW_SPEND === '1' }

  async budget(): Promise<BudgetStatus & { external: { file: string; committedEntries: number }[]; overageWarning: string }> {
    const ext = await readExternalLedgers(this.o.externalLedgers ?? [])
    const status = budgetStatus(await this.ledger.entries(), ext.map((e) => e.entries), this.o.budget ?? DEFAULT_BUDGET)
    return { ...status, external: ext.map((e) => ({ file: e.file, committedEntries: e.entries.length })), overageWarning: OVERAGE_WARNING }
  }

  private async imageFor(m: AssetManifest, prepId: string) {
    if (prepId === 'original') {
      const bytes = await this.library.readFile(m.id, m.original.file)
      return { bytes, mime: MIME[m.original.format], subjects: 1, issues: m.original.issues, sha: m.original.sha256, file: m.original.file }
    }
    const p = m.preparations.find((x) => x.id === prepId)
    if (!p) throw new LibraryError(`unknown preparation ${prepId}`, 404)
    const bytes = await this.library.readFile(m.id, p.file)
    return { bytes, mime: MIME.png, subjects: p.analysis.subjects, issues: p.issues, sha: p.sha256, file: p.file }
  }

  /** Build + validate + price the exact request. Records a generation; NO network, NO spend. */
  async dryRun(assetId: string, prepId: string, opts: GenerationOptions) {
    const m = await this.library.get(assetId)
    const img = await this.imageFor(m, prepId)
    if (sha256(img.bytes) !== img.sha) throw new LibraryError('image on disk does not match its recorded hash', 500)
    const request = buildStandardRequest({ ...opts, name: opts.name || m.title })
    const credits = costOf('standard')
    const issues: Issue[] = validateStandardRequest(request, { bytes: img.bytes.length, mime: img.mime, subjects: img.subjects, issues: img.issues })
    if (prepId === 'original' && !m.original.alphaChannel) issues.push({ level: 'warning', code: 'unprepared', message: 'Sending the unprepared original; background removal and padding usually help.' })
    const status = await this.budget()
    try { assertAffordable(credits, status) } catch (e) { issues.push({ level: 'error', code: 'budget', message: (e as Error).message }) }
    if (status.budget.expires < this.now().toISOString().slice(0, 10)) issues.push({ level: 'error', code: 'expired', message: `Gift credits expired on ${status.budget.expires}.` })
    const ok = !issues.some((i) => i.level === 'error')
    const payloadHash = hash(payloadDigestInput('standard', request, img.sha))
    const g: Generation = {
      id: `gen-${m.generations.length + 1}-${payloadHash.slice(0, 6)}`, createdAt: this.now().toISOString(), endpoint: 'standard',
      preparationId: prepId, imageSha256: img.sha, credits, status: ok ? 'validated' : 'rejected', request, payloadHash,
      idempotencyKey: `rf-creative-${payloadHash.slice(0, 40)}`,
      dryRun: { at: this.now().toISOString(), ok, issues, budgetAvailable: status.available }, approval: null, submission: null, provider: null,
    }
    const manifest = await this.library.save({ ...m, generations: [...m.generations, g] }, m.revision)
    return {
      manifest, generation: g,
      preview: {
        endpoint: 'POST https://api.projectsim.ai/v1/assets/standard',
        steps: ['POST /v1/uploads {count:1} (free)', `multipart upload of ${img.file} (${img.bytes.length} bytes) to the signed storage URL (free)`, `POST /v1/assets/standard with Idempotency-Key ${g.idempotencyKey} (${credits} credits)`],
        body: request, imagePlaceholder: UPLOAD_PLACEHOLDER, credits,
        budgetBefore: status.available, budgetAfter: status.available - credits,
        approvalPhrase: approvalPhrase(credits), licence: PROVIDER_TERMS, overageWarning: OVERAGE_WARNING,
        spendEnabledOnServer: this.spendEnabled(),
      },
    }
  }

  private async withGeneration(assetId: string, genId: string) {
    const m = await this.library.get(assetId)
    const i = m.generations.findIndex((g) => g.id === genId)
    if (i < 0) throw new LibraryError(`unknown generation ${genId}`, 404)
    return { m, i, g: m.generations[i] }
  }

  private put(m: AssetManifest, i: number, g: Generation, extra: Partial<AssetManifest> = {}) {
    const generations = m.generations.slice()
    generations[i] = g
    return this.library.save({ ...m, ...extra, generations }, m.revision)
  }

  async approve(assetId: string, genId: string, input: ApprovalInput) {
    const { m, i, g } = await this.withGeneration(assetId, genId)
    const approval = approve(g, input, this.now())
    return this.put(m, i, { ...g, status: 'approved', approval })
  }

  /** The only code path that spends credits. See the safety list at the top of this file. */
  async submit(assetId: string, genId: string) {
    if (!this.spendEnabled()) throw new LibraryError('spending is disabled: restart the dev server with CREATIVE_ALLOW_SPEND=1 in its environment', 403)
    const { m, i, g } = await this.withGeneration(assetId, genId)
    const img = await this.imageFor(m, g.preparationId)
    const currentHash = hash(payloadDigestInput('standard', g.request, sha256(img.bytes)))
    assertSubmittable(g, currentHash, this.now())
    const existing = (await this.ledger.entries()).find((e) => e.event === 'submitted' && e.key === g.idempotencyKey)
    if (existing) throw new LibraryError(`already submitted as job ${String(existing.job_id)}; never re-sent`, 409)
    assertAffordable(g.credits, await this.budget())
    if (!this.o.clientFactory) throw new LibraryError('no ProjectSim client configured', 500)
    const client = await this.o.clientFactory()
    // Free steps first: a failure here costs nothing and records nothing.
    const handle = await client.mintUpload()
    await client.upload(handle, img.bytes, img.mime, path.basename(img.file))
    const body = { ...g.request, inputs: { ...g.request.inputs, images: [{ upload_id: handle.id }] } }
    await this.ledger.record('intent', { key: g.idempotencyKey, item: `${assetId}/${genId}`, credits: g.credits, endpoint: 'standard', source: 'realmforge-creative' })
    let created
    try {
      created = await client.createStandard(body, g.idempotencyKey)
    } catch (e) {
      if (e instanceof ProjectSimError && e.status >= 400 && e.status < 500) {
        await this.ledger.record('refunded', { key: g.idempotencyKey, item: `${assetId}/${genId}`, reason: `rejected HTTP ${e.status}` })
        await this.put(m, i, { ...g, status: 'failed', error: e.message })
      }
      throw e
    }
    await this.ledger.record('submitted', { key: g.idempotencyKey, item: `${assetId}/${genId}`, credits: g.credits, job_id: created.job_id, asset_id: created.id, effective_params: created.effective_params ?? null })
    return this.put(m, i, { ...g, status: 'submitted', submission: { at: this.now().toISOString(), uploadId: handle.id, jobId: created.job_id, providerAssetId: created.id } },
      { licence: { ...m.licence, provider: PROVIDER_TERMS } })
  }

  /** Poll once (free). On completion download the output, keep it raw, and ingest the GLB. */
  async refresh(assetId: string, genId: string) {
    const { m, i, g } = await this.withGeneration(assetId, genId)
    if (!g.submission) throw new LibraryError('not submitted', 409)
    if (!this.o.clientFactory) throw new LibraryError('no ProjectSim client configured', 500)
    const client = await this.o.clientFactory()
    const asset = await client.asset(g.submission.providerAssetId) as { job?: { status?: string }; files?: { path: string; url: string; kind?: string }[] }
    const status = asset.job?.status
    if (status === 'failed' || status === 'canceled') {
      await this.ledger.record('refunded', { key: g.idempotencyKey, item: `${assetId}/${genId}`, reason: `job ${status}` })
      return { manifest: await this.put(m, i, { ...g, status: 'failed', error: `job ${status}` }), status }
    }
    if (!asset.files?.length) return { manifest: m, status: status ?? 'pending' }
    const dir = `provider/${genId}`
    const files: Record<string, string> = {}
    const blobs: Record<string, Uint8Array> = {}
    for (const f of asset.files) {
      const bytes = await client.download(f.url)
      const ref = await this.library.writeOnce(assetId, `${dir}/${f.path}`, bytes) // resolve() refuses escaping paths
      files[f.path] = ref.sha256
      blobs[f.path] = bytes
    }
    const metadataFile = `${dir}/projectsim_asset.json`
    const metaPath = this.library.resolve(assetId, metadataFile)
    await mkdir(path.dirname(metaPath), { recursive: true })
    await writeFile(metaPath, JSON.stringify(stripUrls(asset), null, 2) + '\n', { flag: 'wx' })
    await this.ledger.record('downloaded', { asset_id: g.submission.providerAssetId, item: `${assetId}/${genId}`, files })
    await this.put(m, i, { ...g, status: 'complete', provider: { dir, files, metadataFile } })
    const glbPath = pickGlb(asset.files)
    const base = path.posix.dirname(glbPath)
    const { manifest, report } = await this.library.setConvertedGlb(assetId, blobs[glbPath], {
      from: `${dir}/${glbPath}`, generationId: genId,
      resolve: (uri) => blobs[path.posix.normalize(path.posix.join(base, uri))] ?? null,
    })
    return { manifest, status: 'complete', report }
  }
}

const GLB_KINDS = ['simready_glb', 'glb']

export function pickGlb(files: { path: string; kind?: string }[]) {
  for (const k of GLB_KINDS) {
    const f = files.find((x) => x.kind === k)
    if (f) return f.path
  }
  const f = files.find((x) => x.path.toLowerCase().endsWith('.glb'))
  if (!f) throw new LibraryError(`no GLB in provider output (kinds: ${files.map((x) => x.kind).join(', ')}); was physics.simulator agnostic?`, 422)
  return f.path
}
