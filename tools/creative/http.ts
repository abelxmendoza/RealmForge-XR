/**
 * HTTP routes for the Creative Studio, mounted by vite/creativeStudioPlugin.ts on the DEV server only.
 *
 * The dev server listens on the LAN (host: true, for the Quest), so these routes:
 *   - answer only loopback clients (127.0.0.1 / ::1) that ALSO address the server as localhost: a
 *     cloudflared tunnel (allowedHosts .trycloudflare.com) connects from loopback too, but with the
 *     tunnel's Host header, so the Host check is what keeps tunnel visitors out;
 *   - require the `X-Creative-Client: 1` header on every POST, which a cross-site page cannot send
 *     without a CORS preflight that this server never approves; a mismatched Origin is refused too;
 *   - never return the ProjectSim token (only whether one is configured).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Library, LibraryError, mimeOf } from './library.ts'
import { Ledger, ProjectSimClient, ProjectSimError, readToken, tokenStatus } from './projectsim.ts'
import { CreativeService } from './service.ts'
import { ApprovalError } from '../../src/creative/generation.ts'
import { BudgetExceeded } from '../../src/creative/credits.ts'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAX_BODY = 110 * 1024 * 1024
const DEFAULT_PX4_LEDGER = path.resolve(REPO, '..', 'px4-autonomous-mission', 'sim_assets', 'projectsim_ledger.jsonl')

export function serviceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const root = path.resolve(env.CREATIVE_LIBRARY_DIR || path.join(REPO, 'creative-library'))
  const external = env.CREATIVE_EXTERNAL_LEDGERS !== undefined
    ? env.CREATIVE_EXTERNAL_LEDGERS.split(path.delimiter).filter(Boolean)
    : existsSync(DEFAULT_PX4_LEDGER) ? [DEFAULT_PX4_LEDGER] : []
  return new CreativeService({
    library: new Library(root), ledger: new Ledger(path.join(root, 'ledger.jsonl')), externalLedgers: external, env,
    clientFactory: async () => {
      const token = await readToken(env)
      if (!token) throw new LibraryError('no ProjectSim token: set PROJECTSIM_TOKEN or create ~/.config/projectsim/token (chmod 600)', 500)
      return new ProjectSimClient(token)
    },
  })
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let n = 0
  for await (const c of req) {
    n += (c as Buffer).length
    if (n > MAX_BODY) throw new LibraryError('request body too large', 413)
    chunks.push(c as Buffer)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

const json = async (req: IncomingMessage) => JSON.parse(new TextDecoder().decode(await readBody(req)) || '{}')
function meta(req: IncomingMessage) {
  const h = req.headers['x-creative-meta']
  return typeof h === 'string' ? JSON.parse(decodeURIComponent(h)) : {}
}

export function creativeHandler(getService: () => CreativeService = () => serviceFromEnv()) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://local')
    if (!url.pathname.startsWith('/api/creative/')) return next()
    if (!LOOPBACK.has(req.socket.remoteAddress ?? '') || !LOCAL_HOST.test(req.headers.host ?? '') || req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return send(res, 403, { error: 'Creative Studio API is only available from this machine.' })
    if (req.method === 'POST') {
      if (req.headers['x-creative-client'] !== '1') return send(res, 403, { error: 'missing X-Creative-Client header' })
      const origin = req.headers.origin
      if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin request refused' })
    }
    const svc = getService()
    const parts = url.pathname.slice('/api/creative/'.length).split('/').filter(Boolean)
    try {
      const [a, id, b, gid, action] = parts
      if (req.method === 'GET' && a === 'status') {
        return send(res, 200, { budget: await svc.budget(), token: await tokenStatus(svc.env), spendEnabled: svc.spendEnabled(), libraryRoot: svc.library.root })
      }
      if (req.method === 'GET' && a === 'assets' && !id) return send(res, 200, { assets: await svc.library.list() })
      if (req.method === 'POST' && a === 'import') {
        const m = meta(req)
        return send(res, 201, await svc.library.importOriginal(await readBody(req), { sourceName: String(m.sourceName ?? 'artwork'), title: m.title, licence: m.licence }))
      }
      if (a === 'assets' && id) {
        if (req.method === 'GET' && !b) return send(res, 200, await svc.library.get(id))
        if (req.method === 'GET' && b === 'verify') return send(res, 200, { files: await svc.library.verify(id) })
        if (req.method === 'GET' && b === 'file') {
          const rel = url.searchParams.get('path') ?? ''
          const m = await svc.library.get(id)
          const known = [m.original.file, ...m.preparations.map((p) => p.file), m.converted?.file, m.preview?.file].filter(Boolean)
          if (!known.includes(rel)) return send(res, 404, { error: 'not a recorded file of this asset' })
          const bytes = await svc.library.readFile(id, rel)
          res.statusCode = 200
          res.setHeader('Content-Type', mimeOf(rel))
          res.setHeader('Cache-Control', 'private, max-age=31536000, immutable') // files are content-addressed / write-once
          return res.end(bytes)
        }
        if (req.method === 'POST' && b === 'preparations') {
          const m = meta(req)
          return send(res, 201, await svc.library.addPreparation(id, await readBody(req), { parent: String(m.parent ?? 'original'), ops: m.ops ?? [] }))
        }
        if (req.method === 'POST' && b === 'model') {
          const m = meta(req)
          return send(res, 201, await svc.library.setConvertedGlb(id, await readBody(req), { from: `manual:${String(m.sourceName ?? 'model.glb')}`, generationId: null }))
        }
        if (req.method === 'POST' && b === 'preview') return send(res, 201, await svc.library.setPreview(id, await readBody(req)))
        if (req.method === 'POST' && b === 'dry-run') {
          const body = await json(req)
          return send(res, 200, await svc.dryRun(id, String(body.preparationId ?? ''), body.options ?? {}))
        }
        if (req.method === 'POST' && b === 'generations' && gid) {
          if (action === 'approve') return send(res, 200, await svc.approve(id, gid, await json(req)))
          if (action === 'submit') return send(res, 200, await svc.submit(id, gid))
          if (action === 'refresh') return send(res, 200, await svc.refresh(id, gid))
        }
      }
      return send(res, 404, { error: 'unknown creative route' })
    } catch (e) {
      if (e instanceof LibraryError) return send(res, e.status, { error: e.message, details: e.details })
      if (e instanceof ApprovalError || e instanceof BudgetExceeded) return send(res, 409, { error: e.message })
      if (e instanceof ProjectSimError) return send(res, 502, { error: e.message, provider: e.problem })
      if (e instanceof SyntaxError) return send(res, 400, { error: `bad request: ${e.message}` })
      console.error('[creative]', e)
      return send(res, 500, { error: (e as Error).message })
    }
  }
}
