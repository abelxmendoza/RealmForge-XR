/**
 * Vercel serverless route for GET /api/assemblyai/token.
 *
 * The Vite plugin and `npm run token:serve` only exist in dev/preview; the deployed static
 * build needs this function so voice commands can mint a short-lived AssemblyAI token.
 * Set ASSEMBLYAI_API_KEY in the Vercel project's environment variables.
 */

import { mintAssemblyAiToken } from '../../tools/assemblyai-token.js'

async function handle(): Promise<Response> {
  const result = await mintAssemblyAiToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (result.ok) headers['Cache-Control'] = 'no-store'
  return new Response(JSON.stringify(result.body), { status: result.status, headers })
}

export const GET = handle
export const POST = handle
