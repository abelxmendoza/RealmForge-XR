/**
 * Vite middleware: GET /api/assemblyai/token
 *
 * Issues a short-lived AssemblyAI streaming token using the server-side
 * ASSEMBLYAI_API_KEY (from dotenvx / process.env). Never exposes the permanent key
 * to browser bundles — do not use VITE_ASSEMBLYAI_API_KEY.
 *
 * Docs: https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token
 */

import type { Plugin } from 'vite'

const TOKEN_URL = 'https://streaming.assemblyai.com/v3/token'

export function assemblyaiTokenPlugin(): Plugin {
  return {
    name: 'realmforge-assemblyai-token',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/assemblyai/token')) return next()
        if (req.method !== 'GET' && req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const apiKey = process.env.ASSEMBLYAI_API_KEY
        if (!apiKey) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error:
                'ASSEMBLYAI_API_KEY is not configured on the server. Use mock voice provider or set the key via dotenvx (npm run env:set -- ASSEMBLYAI_API_KEY <key>).',
            }),
          )
          return
        }

        try {
          const url = new URL(TOKEN_URL)
          url.searchParams.set('expires_in_seconds', '60')
          url.searchParams.set('max_session_duration_seconds', '300')

          const upstream = await fetch(url, {
            method: 'GET',
            headers: { Authorization: apiKey },
          })

          const body = (await upstream.json()) as { token?: string; error?: string }
          if (!upstream.ok || !body.token) {
            res.statusCode = upstream.status || 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: body.error || `AssemblyAI token request failed (${upstream.status})`,
              }),
            )
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ token: body.token, expires_in_seconds: 60 }))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Token proxy failed',
            }),
          )
        }
      })
    },
  }
}
