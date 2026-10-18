/**
 * Claude fallback for voice commands the keyword parser can't read ("a cosy village with a few
 * shops facing a little park"). Shared by the Vite middleware (dev/preview) and the Vercel route.
 *
 * Claude never touches the world. It rewrites the request as short commands in the app's own
 * voice grammar ("add a road", "add 4 houses along the road"); the browser parses those with the
 * same deterministic parser and runs them through the same checks, confirmations and undo.
 *
 * Needs ANTHROPIC_API_KEY on the server (dotenvx: npm run env:set -- ANTHROPIC_API_KEY <key>).
 */

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export const VOICE_PLAN_PATH = '/api/voice/plan'
/** Fast and cheap: this runs while the person waits after speaking. */
export const VOICE_PLAN_MODEL = 'claude-haiku-5-5'

const Plan = z.object({
  commands: z.array(z.string()).describe('Commands in the grammar, in the order to run them. Empty if the request cannot be expressed.'),
  note: z.string().describe('One short sentence for the person if something they asked for is not possible, else empty.'),
})
export type VoicePlan = z.infer<typeof Plan>

const SYSTEM = `You turn a spoken request for a 3D miniature world editor into short commands in its voice grammar.
The editor parses each command with a strict keyword parser, so use only the words below. One thing per command.

Things you can add (counts up to 25 objects, 32 people/vehicles):
- buildings: house, glass tower, office block, industrial building, warehouse
- road (asphalt), park (grass), plaza/platform, wall (brick/glass/wood/metal/concrete), fence
- tree, pine tree, streetlight, crate, metal crate, cargo container, safety barrier
- event props: exhibition booth, registration desk, folding chair, table, cocktail table, stage, queue barrier, directional sign, DJ booth, projection screen
- warehouse: storage rack, workstation, conveyor, loading bay, pickup zone, delivery zone, charging pad, inspection point
- people: people, workers; courier robots; vehicles (cars, trucks)
Looks on new or existing buildings: brick, glass, wood, concrete, metal; colours (red, blue, green, yellow, white, black, grey, orange, purple, pink, brown, beige, teal); pitched roof, flat roof. Sizes: small, big, huge, tall, short.

Command shapes (examples):
- add 3 houses / add a road / add 2 brick houses with pitched roofs / add a big glass tower
- add 4 houses along the road / add 6 trees along the road / add 5 crates in a row / add trees around the goal
- add a tree near the houses / add a wall between the road and the tower / add a tower 20 meters north of the goal
- add a few people walking around / add 2 courier robots heading to the goal / add 3 cars driving around
- build a small neighbourhood / build a busy main street / build a town square / build downtown / build a city park / build a parking lot / build an industrial yard / build a street market
- make the houses brick / paint the second house red / give the houses flat roofs / make the first house a tower
- make the road 30 meters long / make the tower 3 times taller / make the road wider / make the trees solid
- move the houses 5 meters north / rotate the houses 45 degrees / duplicate it 3 times
- remove the trees / delete the people / have the people walk around / send the workers to the goal / make the people stop

Put a road first when the scene is a street, so later buildings, lights and trees line it.
Places: near the robot, by the goal, in the center, N meters north/south/east/west of the goal.
Approximate things the editor lacks with the closest listed thing (shop → house or office block, bench → crate, fountain → plaza with trees around it) and say so in note.
Never invent other nouns. If nothing in the request maps to the editor, return no commands and explain briefly in note.`

export type PlanRequest = { transcript: string; world?: string }
export type PlanResult = { ok: true; status: 200; body: VoicePlan } | { ok: false; status: number; body: { error: string } }

export function readAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ANTHROPIC_API_KEY || undefined
}

export async function planVoiceCommands(req: PlanRequest, env: NodeJS.ProcessEnv = process.env): Promise<PlanResult> {
  const apiKey = readAnthropicApiKey(env)
  if (!apiKey) return { ok: false, status: 503, body: { error: 'ANTHROPIC_API_KEY is not configured on the server.' } }
  const transcript = typeof req.transcript === 'string' ? req.transcript.trim().slice(0, 600) : ''
  if (!transcript) return { ok: false, status: 400, body: { error: 'Missing transcript.' } }
  const world = typeof req.world === 'string' ? req.world.slice(0, 1500) : ''

  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })
  try {
    const response = await client.messages.parse({
      model: VOICE_PLAN_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Plan) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${world ? `Current world: ${world}\n\n` : ''}Request: ${transcript}` }],
    })
    if (response.stop_reason === 'refusal') return { ok: false, status: 422, body: { error: 'That request was declined.' } }
    const plan = response.parsed_output
    if (!plan) return { ok: false, status: 502, body: { error: 'Claude returned an unreadable plan.' } }
    // Belt and braces: short, plain command strings only.
    const commands = plan.commands.map((c) => String(c).slice(0, 200)).filter(Boolean).slice(0, 20)
    return { ok: true, status: 200, body: { commands, note: String(plan.note ?? '').slice(0, 300) } }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, status: 503, body: { error: 'ANTHROPIC_API_KEY was rejected.' } }
    if (err instanceof Anthropic.RateLimitError) return { ok: false, status: 429, body: { error: 'Claude is busy, try again in a moment.' } }
    if (err instanceof Anthropic.APIError) return { ok: false, status: 502, body: { error: `Claude request failed (${err.status ?? 'network'})` } }
    return { ok: false, status: 502, body: { error: err instanceof Error ? err.message : 'Claude request failed' } }
  }
}

type ConnectLikeReq = { url?: string; method?: string; on: (event: string, cb: (chunk?: unknown) => void) => void }
type ConnectLikeRes = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void }

function readBody(req: ConnectLikeReq, limit = 16_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += String(chunk)
      if (body.length > limit) reject(new Error('Body too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', (e) => reject(e as Error))
  })
}

/** Connect-style middleware for Vite configureServer / configurePreviewServer. */
export async function handleVoicePlanRequest(req: ConnectLikeReq, res: ConnectLikeRes, next: () => void, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!req.url?.startsWith(VOICE_PLAN_PATH)) return next()
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }
  let parsed: PlanRequest
  try {
    parsed = JSON.parse(await readBody(req)) as PlanRequest
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }
  const result = await planVoiceCommands(parsed, env)
  res.statusCode = result.status
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(result.body))
}
