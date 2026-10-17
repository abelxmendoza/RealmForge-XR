import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'
import type { ParseResult, VoiceCommand } from './types'

/** Normalize spoken text for keyword matching. */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ENV_ALIASES: { id: EnvironmentId; phrases: string[] }[] = [
  { id: 'mars-outpost', phrases: ['mars outpost', 'mars', 'martian', 'red planet'] },
  { id: 'warehouse', phrases: ['warehouse', 'autonomous warehouse', 'the warehouse'] },
  { id: 'forge-district', phrases: ['forge district', 'forge', 'demo city', 'city'] },
]

function matchEnvironment(t: string): EnvironmentId | null {
  // Longer phrases first to avoid "mars" beating "mars outpost" incorrectly — already ordered.
  for (const { id, phrases } of ENV_ALIASES) {
    for (const p of phrases) {
      if (t.includes(p)) return id
    }
  }
  return null
}

type Rule = { test: (t: string) => boolean; command: VoiceCommand }

const TOOL_RULES: { phrases: string[]; tool: Tool }[] = [
  { phrases: ['building tool', 'select building', 'create a building', 'create building', 'place a building', 'place building'], tool: 'building' },
  { phrases: ['wall tool', 'select wall', 'create a wall', 'create wall', 'draw a wall', 'draw wall'], tool: 'wall' },
  { phrases: ['road tool', 'select road', 'place a platform', 'place platform', 'platform tool', 'select platform'], tool: 'platform' },
  { phrases: ['decor tool', 'decoration', 'select decor'], tool: 'decor' },
  { phrases: ['select robot', 'place robot', 'robot tool'], tool: 'robot' },
  { phrases: ['set destination', 'set goal', 'place goal', 'goal tool', 'select goal'], tool: 'goal' },
  { phrases: ['select tool', 'select mode', 'move tool'], tool: 'select' },
]

/**
 * Deterministic parser — no LLM. Returns unsupported for unrecognized speech.
 * "Create a building" activates the building tool (does not spawn at arbitrary coords).
 */
export function parseVoiceCommand(transcript: string): ParseResult {
  const t = normalizeTranscript(transcript)
  if (!t) return { ok: false, reason: 'empty', transcript }

  // Environment load / switch
  if (
    t.includes('load') ||
    t.includes('open') ||
    t.includes('switch to') ||
    t.includes('switch') ||
    t.startsWith('go to')
  ) {
    const env = matchEnvironment(t)
    if (env) return { ok: true, command: { type: 'LOAD_ENVIRONMENT', environmentId: env } }
  }
  // Bare environment names with intent words nearby
  if (t.includes('mars') || t.includes('warehouse') || t.includes('forge')) {
    if (t.includes('load') || t.includes('open') || t.includes('switch') || t.includes('go to')) {
      const env = matchEnvironment(t)
      if (env) return { ok: true, command: { type: 'LOAD_ENVIRONMENT', environmentId: env } }
    }
  }

  const rules: Rule[] = [
    { test: (s) => /\bundo\b/.test(s), command: { type: 'UNDO' } },
    { test: (s) => /\bredo\b/.test(s), command: { type: 'REDO' } },
    { test: (s) => /\bsave( the)? world\b/.test(s) || s === 'save' || s === 'save world', command: { type: 'SAVE_WORLD' } },
    {
      test: (s) =>
        /\bdelete selected\b/.test(s) ||
        /\bdelete (the )?object\b/.test(s) ||
        /\bremove selected\b/.test(s),
      command: { type: 'DELETE_SELECTED' },
    },
    {
      test: (s) => /\breset selection\b/.test(s) || /\bclear selection\b/.test(s) || /\bdeselect\b/.test(s),
      command: { type: 'CLEAR_SELECTION' },
    },
    {
      test: (s) =>
        /\bcreate a blank world\b/.test(s) ||
        /\bblank world\b/.test(s) ||
        /\breset world\b/.test(s) ||
        /\bclear world\b/.test(s),
      command: { type: 'RESET_WORLD' },
    },
    {
      test: (s) => /\bstart navigation\b/.test(s) || /\bstart (the )?robot\b/.test(s) || s === 'navigate',
      command: { type: 'START_NAVIGATION' },
    },
  ]

  for (const r of rules) {
    if (r.test(t)) return { ok: true, command: r.command }
  }

  for (const { phrases, tool } of TOOL_RULES) {
    if (phrases.some((p) => t.includes(p))) {
      return { ok: true, command: { type: 'SELECT_TOOL', tool } }
    }
  }

  // "Stop navigation" — no dedicated stop API; clear goal is too aggressive → unsupported
  if (/\bstop navigation\b/.test(t)) {
    return { ok: false, reason: 'unsupported', transcript }
  }

  return { ok: false, reason: 'unsupported', transcript }
}
