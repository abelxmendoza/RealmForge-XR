/**
 * Vercel serverless route for POST /api/voice/plan (Claude fallback for voice commands).
 * Set ANTHROPIC_API_KEY in the Vercel project's environment variables.
 */

import { planVoiceCommands, type PlanRequest } from '../../tools/voice-plan.js'

export async function POST(request: Request): Promise<Response> {
  let body: PlanRequest
  try {
    body = (await request.json()) as PlanRequest
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const result = await planVoiceCommands(body)
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
