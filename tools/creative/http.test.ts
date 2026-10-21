import { mkdtemp } from 'node:fs/promises'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creativeHandler, serviceFromEnv } from './http.ts'
import { encodePng } from './png.ts'
import { makeRgba } from '../../src/creative/pixels.ts'

let server: Server
let base: string
let root: string

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rf-creative-http-'))
  const env = { CREATIVE_LIBRARY_DIR: root, CREATIVE_EXTERNAL_LEDGERS: '', PROJECTSIM_TOKEN: 'kps_should_never_leak' }
  const handle = creativeHandler(() => serviceFromEnv(env))
  server = createServer((req, res) => void handle(req, res, () => { res.statusCode = 404; res.end('next') }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

const H = { 'X-Creative-Client': '1' }

describe('creative HTTP routes', () => {
  it('passes non-creative routes through', async () => {
    expect(await (await fetch(`${base}/other`)).text()).toBe('next')
  })

  it('reports status without leaking the token', async () => {
    const r = await fetch(`${base}/api/creative/status`)
    const text = await r.text()
    expect(r.status).toBe(200)
    expect(text).not.toContain('kps_should_never_leak')
    expect(JSON.parse(text)).toMatchObject({ spendEnabled: false, token: { configured: true, source: 'env' }, budget: { available: 24 } })
  })

  it('refuses tunnel traffic that reaches the server from loopback with a public Host', async () => {
    const status = (headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
      const req = request(`${base}/api/creative/status`, { headers }, (res) => { res.resume(); resolve(res.statusCode ?? 0) })
      req.on('error', reject)
      req.end()
    })
    expect(await status({ Host: 'abc.trycloudflare.com' })).toBe(403)
    expect(await status({ 'CF-Connecting-IP': '203.0.113.9' })).toBe(403)
    expect(await status({})).toBe(200)
  })

  it('refuses POSTs without the client header or from another origin', async () => {
    expect((await fetch(`${base}/api/creative/import`, { method: 'POST', body: 'x' })).status).toBe(403)
    expect((await fetch(`${base}/api/creative/import`, { method: 'POST', body: 'x', headers: { ...H, Origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('imports, serves only recorded files, dry-runs, and refuses submit while spend is disabled', async () => {
    const img = makeRgba(1024, 1024)
    for (let y = 200; y < 800; y++) for (let x = 300; x < 700; x++) img.data.set([10, 200, 90, 255], (y * 1024 + x) * 4)
    const png = encodePng(img)
    const imp = await fetch(`${base}/api/creative/import`, { method: 'POST', body: png as BodyInit, headers: { ...H, 'X-Creative-Meta': encodeURIComponent(JSON.stringify({ sourceName: 'leaf.png', title: 'Leaf' })) } })
    expect(imp.status).toBe(201)
    const { manifest } = await imp.json()
    const file = await fetch(`${base}/api/creative/assets/${manifest.id}/file?path=${encodeURIComponent(manifest.original.file)}`)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png)
    expect((await fetch(`${base}/api/creative/assets/${manifest.id}/file?path=../../ledger.jsonl`)).status).toBe(404)
    expect((await fetch(`${base}/api/creative/assets/${manifest.id}/file?path=manifest.json`)).status).toBe(404)
    const dry = await (await fetch(`${base}/api/creative/assets/${manifest.id}/dry-run`, { method: 'POST', headers: H, body: JSON.stringify({ preparationId: 'original', options: { name: 'Leaf' } }) })).json()
    expect(dry.generation.status).toBe('validated')
    const sub = await fetch(`${base}/api/creative/assets/${manifest.id}/generations/${dry.generation.id}/submit`, { method: 'POST', headers: H })
    expect(sub.status).toBe(403)
    expect((await sub.json()).error).toMatch(/CREATIVE_ALLOW_SPEND/)
    const appr = await fetch(`${base}/api/creative/assets/${manifest.id}/generations/${dry.generation.id}/approve`, { method: 'POST', headers: H, body: JSON.stringify({ phrase: 'ok' }) })
    expect(appr.status).toBe(409)
  })
})
