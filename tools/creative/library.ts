/**
 * Creative asset library on disk (Node only). Layout, per asset:
 *
 *   creative-library/assets/<id>/
 *     manifest.json            current manifest (schema in src/creative/manifest.ts)
 *     history/r0001.json ...   every previous revision, never rewritten
 *     original/<sha256>.<ext>  the imported artwork, byte-for-byte, mode 0444, never modified
 *     derived/<prep-id>.png    prepared copies (ops recorded in the manifest), mode 0444
 *     provider/<gen-id>/...    raw ProjectSim output as downloaded (URLs stripped from metadata)
 *     converted/model.glb      validated GLB the viewer loads
 *     preview/preview.png      viewer screenshot
 *
 * The library folder is gitignored: it holds personal artwork and provider outputs.
 * Every file write uses flag 'wx' (fail if it exists) except manifest.json, which is replaced
 * atomically (temp + rename) after its previous revision is copied to history/.
 */
import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, rename, writeFile, copyFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { validateImageBytes, hasErrors, MIME, type ImageFormat } from '../../src/creative/imageInfo.ts'
import { analysePixels, validateOps, type PrepOp } from '../../src/creative/pixels.ts'
import { inspectGltf, type GltfReport } from '../../src/creative/glb.ts'
import { ID_RE, MANIFEST_FORMAT, SCHEMA_VERSION, validateManifest, type AssetManifest, type Licence, type Preparation } from '../../src/creative/manifest.ts'
import { decodePng } from './png.ts'

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const EXT: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' }

export class LibraryError extends Error {
  readonly status: number
  readonly details?: unknown
  constructor(message: string, status = 400, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function slug(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'artwork'
}

export class Library {
  readonly root: string
  private now: () => Date
  constructor(root: string, now: () => Date = () => new Date()) {
    this.root = root
    this.now = now
  }

  get assetsDir() { return path.join(this.root, 'assets') }

  dir(id: string) {
    if (!ID_RE.test(id)) throw new LibraryError(`invalid asset id ${id}`)
    return path.join(this.assetsDir, id)
  }

  /** Resolve a manifest-relative path, refusing anything that escapes the asset folder. */
  resolve(id: string, rel: string) {
    const base = this.dir(id)
    const full = path.resolve(base, rel)
    if (!full.startsWith(base + path.sep)) throw new LibraryError(`path escapes asset folder: ${rel}`, 403)
    return full
  }

  async list(): Promise<AssetManifest[]> {
    if (!existsSync(this.assetsDir)) return []
    const out: AssetManifest[] = []
    for (const id of (await readdir(this.assetsDir)).sort()) {
      if (!ID_RE.test(id)) continue
      try { out.push(await this.get(id)) } catch (e) { console.warn(`[creative] skipping ${id}: ${(e as Error).message}`) }
    }
    return out
  }

  async get(id: string): Promise<AssetManifest> {
    const file = path.join(this.dir(id), 'manifest.json')
    if (!existsSync(file)) throw new LibraryError(`no asset ${id}`, 404)
    const m = JSON.parse(await readFile(file, 'utf8'))
    const problems = validateManifest(m)
    if (problems.length) throw new LibraryError(`manifest ${id} invalid: ${problems.join('; ')}`, 500)
    return m
  }

  /** Validate, bump revision, archive the previous revision, write atomically. */
  async save(m: AssetManifest, expectedRevision: number): Promise<AssetManifest> {
    const dir = this.dir(m.id)
    const file = path.join(dir, 'manifest.json')
    if (existsSync(file)) {
      const current = JSON.parse(await readFile(file, 'utf8')) as AssetManifest
      if (current.revision !== expectedRevision) throw new LibraryError(`manifest ${m.id} changed (revision ${current.revision}, expected ${expectedRevision})`, 409)
      await mkdir(path.join(dir, 'history'), { recursive: true })
      await copyFile(file, path.join(dir, 'history', `r${String(current.revision).padStart(4, '0')}.json`))
    }
    const next = { ...m, revision: expectedRevision + 1, updatedAt: this.now().toISOString() }
    const problems = validateManifest(next)
    if (problems.length) throw new LibraryError(`refusing to write invalid manifest: ${problems.join('; ')}`, 500)
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(next, null, 2) + '\n')
    await rename(tmp, file)
    return next
  }

  /** Write a new immutable file inside the asset; never overwrites. */
  async writeOnce(id: string, rel: string, bytes: Uint8Array) {
    const full = this.resolve(id, rel)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, bytes, { flag: 'wx' })
    await chmod(full, 0o444)
    return { file: rel, sha256: sha256(bytes), bytes: bytes.length }
  }

  async readFile(id: string, rel: string) {
    return new Uint8Array(await readFile(this.resolve(id, rel)))
  }

  /** Import artwork. Same bytes imported twice return the existing asset (dedupe by sha256). */
  async importOriginal(bytes: Uint8Array, opts: { sourceName: string; title?: string; licence?: Partial<Licence> }) {
    const { info, issues } = validateImageBytes(bytes)
    if (!info || hasErrors(issues)) throw new LibraryError('image rejected', 422, issues)
    const hash = sha256(bytes)
    for (const m of await this.list()) if (m.original.sha256 === hash) return { manifest: m, duplicate: true }
    const title = (opts.title || opts.sourceName.replace(/\.[^.]+$/, '')).trim().slice(0, 80) || 'Artwork'
    const id = `${slug(title)}-${hash.slice(0, 8)}`
    const now = this.now().toISOString()
    const ref = await this.writeOnce(id, `original/${hash}.${EXT[info.format]}`, bytes)
    const manifest: AssetManifest = {
      format: MANIFEST_FORMAT, schemaVersion: SCHEMA_VERSION, revision: 0, id, title, createdAt: now, updatedAt: now,
      original: { ...ref, format: info.format, width: info.width, height: info.height, alphaChannel: info.alphaChannel, sourceName: path.basename(opts.sourceName).slice(0, 200), importedAt: now, issues },
      preparations: [], generations: [], converted: null, preview: null,
      licence: { origin: opts.licence?.origin ?? 'original-artwork', owner: opts.licence?.owner ?? 'me', notes: opts.licence?.notes ?? '', ...(opts.licence?.attribution ? { attribution: opts.licence.attribution } : {}), ...(opts.licence?.source ? { source: opts.licence.source } : {}) },
    }
    return { manifest: await this.save(manifest, 0), duplicate: false }
  }

  /**
   * Store a prepared (derived) copy. The server re-validates the PNG and recomputes the pixel analysis
   * itself; the browser's op list is stored as the recipe.
   */
  async addPreparation(id: string, png: Uint8Array, opts: { parent: string; ops: PrepOp[] }) {
    const m = await this.get(id)
    if (opts.parent !== 'original' && !m.preparations.some((p) => p.id === opts.parent)) throw new LibraryError(`unknown parent ${opts.parent}`)
    if (!validateOps(opts.ops)) throw new LibraryError('invalid preparation ops')
    const { info, issues } = validateImageBytes(png)
    if (!info || info.format !== 'png') throw new LibraryError('prepared image must be a PNG', 422, issues)
    const rgba = decodePng(png)
    const a = analysePixels(rgba)
    const allIssues = [...issues.filter((i) => i.code !== 'no-alpha' || !a.alpha.usesAlpha), ...a.issues]
    const prepId = `prep-${m.preparations.length + 1}-${sha256(png).slice(0, 6)}`
    const ref = await this.writeOnce(id, `derived/${prepId}.png`, png)
    const prep: Preparation = {
      ...ref, id: prepId, parent: opts.parent, ops: opts.ops, width: info.width, height: info.height,
      analysis: { subjects: a.subjects.subjects, specks: a.subjects.specks, transparentFraction: +a.alpha.transparentFraction.toFixed(4), foregroundFraction: +a.subjects.foregroundFraction.toFixed(4) },
      issues: allIssues, createdAt: this.now().toISOString(),
    }
    return this.save({ ...m, preparations: [...m.preparations, prep] }, m.revision)
  }

  /** Check a GLB and, if it passes, store it as the asset's converted model. */
  async setConvertedGlb(id: string, glb: Uint8Array, opts: { from: string; generationId: string | null; resolve?: (uri: string) => Uint8Array | null }): Promise<{ manifest: AssetManifest; report: GltfReport }> {
    const report = inspectGltf(glb, opts.resolve)
    if (!report.ok) throw new LibraryError('model rejected', 422, report)
    if (report.container !== 'glb') throw new LibraryError('converted model must be a self-contained .glb', 422, report)
    const m = await this.get(id)
    const n = m.converted ? Number(/model-(\d+)/.exec(m.converted.file)?.[1] ?? 1) + 1 : 1
    const ref = await this.writeOnce(id, `converted/model-${n}.glb`, glb)
    const manifest = await this.save({
      ...m,
      converted: { ...ref, from: opts.from, generationId: opts.generationId, triangles: report.triangles, extents: report.extents, textures: report.textures, warnings: report.warnings, convertedAt: this.now().toISOString() },
    }, m.revision)
    return { manifest, report }
  }

  async setPreview(id: string, png: Uint8Array) {
    const { info } = validateImageBytes(png)
    if (!info || info.format !== 'png') throw new LibraryError('preview must be a PNG', 422)
    const m = await this.get(id)
    const ref = await this.writeOnce(id, `preview/preview-${Date.now()}.png`, png)
    return this.save({ ...m, preview: ref }, m.revision)
  }

  /** Re-hash every recorded file: proves originals and outputs are untouched. */
  async verify(id: string) {
    const m = await this.get(id)
    const refs = [m.original, ...m.preparations, ...(m.converted ? [m.converted] : []), ...(m.preview ? [m.preview] : [])]
    const out: { file: string; ok: boolean; readOnly: boolean }[] = []
    for (const r of refs) {
      const full = this.resolve(id, r.file)
      const ok = existsSync(full) && sha256(new Uint8Array(await readFile(full))) === r.sha256
      out.push({ file: r.file, ok, readOnly: ok && ((await stat(full)).mode & 0o222) === 0 })
    }
    return out
  }
}

export const mimeOf = (file: string) =>
  file.endsWith('.glb') ? 'model/gltf-binary' : file.endsWith('.json') ? 'application/json'
    : file.endsWith('.png') ? MIME.png : /\.jpe?g$/.test(file) ? MIME.jpeg : file.endsWith('.webp') ? MIME.webp : 'application/octet-stream'
