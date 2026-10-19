/**
 * Browser side of the Claude fallback: when the keyword parser can't read a sentence, ask
 * POST /api/voice/plan to rewrite it as commands in our own grammar, then parse those locally.
 * Nothing Claude returns runs unless our parser understands it.
 */

import { useWorld } from '../world/store'
import { parseScene, parseSceneClause } from './sceneCommands'
import type { VoiceCommand } from './types'

export const VOICE_PLAN_URL = '/api/voice/plan'

/** Off for the rest of the session once the server says it has no key. */
let unavailable = false
export const resetClaudeFallback = () => {
  unavailable = false
}

/** A few words about the world so "make them bigger" or "line the road" has context. */
export function describeWorld(): string {
  const w = useWorld.getState()
  const counts = new Map<string, number>()
  for (const o of Object.values(w.objects)) {
    const name = o.kind === 'building' ? `${o.style ?? 'office'} building` : o.kind === 'platform' && o.material === 'asphalt' ? 'road' : o.kind
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  for (const a of Object.values(w.actors)) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1)
  const things = [...counts].map(([k, n]) => `${n} ${k}`).join(', ') || 'empty'
  const selected = w.selectedId ? w.objects[w.selectedId] : null
  return `${things}. Selected: ${selected ? selected.kind : 'nothing'}. Goal: ${w.goal ? 'set' : 'none'}.`
}

export type ClaudePlan = { command: VoiceCommand | null; note: string; understood: string[] }

export async function askClaude(transcript: string, opts: { url?: string; signal?: AbortSignal } = {}): Promise<ClaudePlan | null> {
  if (unavailable || typeof fetch !== 'function') return null
  let res: Response
  try {
    res = await fetch(opts.url ?? VOICE_PLAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, world: describeWorld() }),
      signal: opts.signal,
    })
  } catch {
    return null
  }
  if (res.status === 503 || res.status === 404) {
    unavailable = true
    return null
  }
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as { commands?: unknown; note?: unknown } | null
  if (!body || !Array.isArray(body.commands)) return null
  const understood: string[] = []
  const commands: VoiceCommand[] = []
  for (const raw of body.commands.slice(0, 20)) {
    if (typeof raw !== 'string') continue
    const text = raw.toLowerCase().replace(/[^\w\s,-]/g, ' ').replace(/\s+/g, ' ').trim()
    // Claude sometimes joins two things in one line ("add a road and 4 houses").
    const c = parseScene(text) ?? parseSceneClause(text.replace(/,/g, ' ').replace(/\s+/g, ' '))
    if (!c) continue
    understood.push(raw)
    commands.push(...(c.type === 'BATCH' ? c.commands : [c]))
  }
  const note = typeof body.note === 'string' ? body.note : ''
  if (!commands.length) return { command: null, note, understood }
  const command: VoiceCommand = commands.length === 1 ? commands[0] : { type: 'BATCH', commands, skipped: [] }
  return { command, note, understood }
}
