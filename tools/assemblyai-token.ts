/**
 * Shared AssemblyAI temporary-token minting for Vite middleware and standalone demos.
 *
 * Never expose ASSEMBLYAI_API_KEY to the browser. Clients call GET /api/assemblyai/token
 * and receive a short-lived streaming token only.
 *
 * Docs: https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token
 */

export const ASSEMBLYAI_TOKEN_PATH = '/api/assemblyai/token'
const TOKEN_URL = 'https://streaming.assemblyai.com/v3/token'

export type TokenMintResult =
  | { ok: true; status: 200; body: { token: string; expires_in_seconds: number } }
  | { ok: false; status: number; body: { error: string } }

export function readAssemblyAiApiKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env.ASSEMBLYAI_API_KEY || env.ASSEMBLY_AI_API_KEY
}

/** Mint a temporary streaming token. Safe to call from Node (dev, preview, or token-server). */
export async function mintAssemblyAiToken(
  env: NodeJS.ProcessEnv = process.env,
): Promise<TokenMintResult> {
  const apiKey = readAssemblyAiApiKey(env)
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: {
        error:
          'ASSEMBLYAI_API_KEY is not configured on the server. Browser speech still works on Chrome/Edge/Safari, or set the key via dotenvx (npm run env:set -- ASSEMBLYAI_API_KEY <key>).',
      },
    }
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
      return {
        ok: false,
        status: upstream.status || 502,
        body: {
          error: body.error || `AssemblyAI token request failed (${upstream.status})`,
        },
      }
    }

    return {
      ok: true,
      status: 200,
      body: { token: body.token, expires_in_seconds: 60 },
    }
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        error: err instanceof Error ? err.message : 'Token proxy failed',
      },
    }
  }
}

export type ConnectLikeReq = { url?: string; method?: string }
export type ConnectLikeRes = {
  statusCode: number
  setHeader: (k: string, v: string) => void
  end: (body: string) => void
}

/**
 * Connect-style middleware shared by Vite configureServer / configurePreviewServer
 * and by `npm run token:serve`.
 */
export async function handleAssemblyAiTokenRequest(
  req: ConnectLikeReq,
  res: ConnectLikeRes,
  next: () => void,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!req.url?.startsWith(ASSEMBLYAI_TOKEN_PATH)) return next()

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const result = await mintAssemblyAiToken(env)
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json')
  if (result.ok) res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(result.body))
}
