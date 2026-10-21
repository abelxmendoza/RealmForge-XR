/**
 * ProjectSim (api.projectsim.ai, Kaedim) client + spend ledger for the Creative Studio (Node only).
 *
 * This is a TypeScript PORT of the protocol in the PX4 repo's tools/sim_assets/projectsim.py (not a
 * copy of its code): same token rules, same ledger JSONL events, same idempotency idea. Keep the two
 * in step; docs/creative-studio/AUDIT.md proposes extracting a shared spec + conformance fixtures.
 *
 * Endpoints used (docs.projectsim.ai, read 2026-10-21):
 *   POST /v1/uploads {count}                -> {uploads:[{id,url,fields,max_bytes,expires_at}]}   free
 *   POST <url> multipart (fields..., file)  -> 204 (S3, NO Authorization header)                 free
 *   POST /v1/assets/standard                -> 202 {id, job_id, status, effective_params}        4 credits
 *   GET  /v1/jobs/{id}, GET /v1/assets/{id} (files[{path,url,kind}], URLs live 1 h)              free
 *
 * Token: PROJECTSIM_TOKEN or KAEDIM_API_TOKEN env, else ~/.config/projectsim/token (must be chmod 600). Never logged,
 * never returned to the browser, never written by this code.
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LedgerEntry } from '../../src/creative/credits.ts'

export const BASE_URL = 'https://api.projectsim.ai'
export const TOKEN_FILE = path.join(os.homedir(), '.config', 'projectsim', 'token')

export class ProjectSimError extends Error {
  readonly status: number
  readonly problem: Record<string, unknown>
  constructor(status: number, problem: Record<string, unknown>) {
    super(`HTTP ${status}: ${String(problem.title ?? '')} ${String(problem.detail ?? '')} (request_id=${String(problem.request_id ?? '')})`)
    this.status = status
    this.problem = problem
  }
}

export async function readToken(env: NodeJS.ProcessEnv = process.env, file = env.PROJECTSIM_TOKEN_FILE || TOKEN_FILE): Promise<string | null> {
  // KAEDIM_API_TOKEN is the name this repo's dotenvx .env already uses.
  const fromEnv = env.PROJECTSIM_TOKEN || env.KAEDIM_API_TOKEN
  if (fromEnv) return fromEnv.trim()
  if (!existsSync(file)) return null
  if ((await stat(file)).mode & 0o077) throw new Error(`${file} is readable by other users; run: chmod 600 ${file}`)
  return (await readFile(file, 'utf8')).trim() || null
}

/** Whether a token is configured, WITHOUT revealing it. */
export async function tokenStatus(env: NodeJS.ProcessEnv = process.env) {
  try {
    const t = await readToken(env)
    return { configured: !!t, looksValid: !!t && t.startsWith('kps_'), source: env.PROJECTSIM_TOKEN || env.KAEDIM_API_TOKEN ? 'env' : t ? 'file' : 'none' }
  } catch (e) {
    return { configured: false, looksValid: false, source: 'error', error: (e as Error).message }
  }
}

export type Fetch = typeof fetch

export class ProjectSimClient {
  readonly #token: string
  private fetchImpl: Fetch
  private baseUrl: string
  constructor(token: string, fetchImpl: Fetch = fetch, baseUrl = BASE_URL) {
    this.fetchImpl = fetchImpl
    this.baseUrl = baseUrl
    if (!token.startsWith('kps_')) throw new Error('token does not look like a ProjectSim token (kps_...)')
    this.#token = token
  }

  toJSON() { return '<ProjectSimClient token=***>' }

  async #json(res: Response, expected: number | number[]) {
    if (![expected].flat().includes(res.status)) {
      let problem: Record<string, unknown>
      try { problem = (await res.json()) as Record<string, unknown> } catch { problem = { title: res.statusText } }
      throw new ProjectSimError(res.status, problem)
    }
    return res.json() as Promise<Record<string, unknown>>
  }

  #api(p: string, init: RequestInit = {}) {
    return this.fetchImpl(`${this.baseUrl}${p}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${this.#token}` } })
  }

  async mintUpload() {
    const r = await this.#json(await this.#api('/v1/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 1 }) }), [200, 201]) // status code not documented
    const u = (r.uploads as { id: string; url: string; fields: Record<string, string>; max_bytes: number; expires_at: string }[])[0]
    if (!u?.id || !u.url) throw new Error('upload mint returned no handle')
    return u
  }

  /** Signed S3 form POST: all fields unchanged, file LAST, no Authorization header. */
  async upload(handle: { url: string; fields: Record<string, string>; max_bytes: number }, bytes: Uint8Array, mime: string, filename: string) {
    if (bytes.length > handle.max_bytes) throw new Error('file exceeds upload max_bytes')
    const form = new FormData()
    for (const [k, v] of Object.entries(handle.fields)) form.append(k, v)
    form.append('file', new Blob([bytes as BlobPart], { type: mime }), filename)
    const res = await this.fetchImpl(handle.url, { method: 'POST', body: form })
    if (res.status !== 204 && res.status !== 201 && res.status !== 200) throw new ProjectSimError(res.status, { title: 'storage upload failed' })
  }

  async createStandard(body: unknown, idempotencyKey: string) {
    return this.#json(await this.#api('/v1/assets/standard', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }), 202) as Promise<{ id: string; job_id: string; status?: string; effective_params?: unknown }>
  }

  async job(jobId: string) { return this.#json(await this.#api(`/v1/jobs/${encodeURIComponent(jobId)}`), 200) }
  async asset(assetId: string) { return this.#json(await this.#api(`/v1/assets/${encodeURIComponent(assetId)}`), 200) }

  /** Presigned file URL: fetched WITHOUT the API token. */
  async download(url: string) {
    const res = await this.fetchImpl(url)
    if (!res.ok) throw new ProjectSimError(res.status, { title: 'download failed' })
    return new Uint8Array(await res.arrayBuffer())
  }
}

/** Deep copy without presigned URLs (they are bearer credentials). */
export function stripUrls<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUrls) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'url' && k !== 'fields').map(([k, x]) => [k, stripUrls(x)])) as T
  return v
}

/** Append-only JSONL ledger, same events as the PX4 projectsim.py ledger. */
export class Ledger {
  readonly file: string
  constructor(file: string) { this.file = file }

  async entries(): Promise<LedgerEntry[]> {
    if (!existsSync(this.file)) return []
    return (await readFile(this.file, 'utf8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  }

  async record(event: string, fields: Record<string, unknown>) {
    const entry = { utc: new Date().toISOString().replace(/\.\d+Z$/, '+00:00'), event, ...fields }
    await mkdir(path.dirname(this.file), { recursive: true })
    await appendFile(this.file, JSON.stringify(entry) + '\n')
    return entry
  }
}

/** Read-only ledgers from other projects on the same account (e.g. the PX4 robotics batches). */
export async function readExternalLedgers(files: string[]): Promise<{ file: string; entries: LedgerEntry[] }[]> {
  const out = []
  for (const f of files) if (existsSync(f)) out.push({ file: f, entries: await new Ledger(f).entries() })
  return out
}
