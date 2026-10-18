/**
 * Production-style token API for demos beyond `vite` / `vite preview`.
 *
 * Serves GET /api/assemblyai/token on TOKEN_PORT (default 8787).
 * Point a reverse proxy or tunnel at this process when hosting static `dist/`.
 *
 * Usage (with dotenvx key available):
 *   npm run token:serve
 *   curl -s http://127.0.0.1:8787/api/assemblyai/token
 */

import http from 'node:http'
import {
  ASSEMBLYAI_TOKEN_PATH,
  mintAssemblyAiToken,
  readAssemblyAiApiKey,
} from './assemblyai-token'

const port = Number(process.env.TOKEN_PORT || 8787)
const host = process.env.TOKEN_HOST || '127.0.0.1'

const server = http.createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]

  if (path === '/health' || path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, token_route: ASSEMBLYAI_TOKEN_PATH }))
    return
  }

  if (path !== ASSEMBLYAI_TOKEN_PATH) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', hint: `Use ${ASSEMBLYAI_TOKEN_PATH}` }))
    return
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  void mintAssemblyAiToken().then((result) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (result.ok) headers['Cache-Control'] = 'no-store'
    res.writeHead(result.status, headers)
    res.end(JSON.stringify(result.body))
  })
})

server.listen(port, host, () => {
  const key = readAssemblyAiApiKey()
  console.log(`[token-server] http://${host}:${port}${ASSEMBLYAI_TOKEN_PATH}`)
  console.log(
    `[token-server] ASSEMBLYAI_API_KEY ${key ? 'present' : 'MISSING — returns 503 until set via dotenvx'}`,
  )
})
