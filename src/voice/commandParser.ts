import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'
import type { ParseResult, VoiceCommand } from './types'
import { parseObjectCommand } from './objectCommands'
import { parseOpenSaved, parseWorldCommand } from './worldCommands'

/** Normalize spoken text for keyword matching. */
export function normalizeTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ENV_ALIASES: { id: EnvironmentId; phrases: string[] }[] = [
  { id: 'job-fair', phrases: ['job fair', 'career fair'] },
  { id: 'empty-event-venue', phrases: ['empty space', 'empty event venue', 'empty venue', 'empty environment'] },
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
  { phrases: ['pallet tool', 'place a pallet', 'place pallet', 'rack tool', 'place a rack', 'place rack', 'equipment tool'], tool: 'asset' },
  { phrases: ['select robot', 'place robot', 'robot tool'], tool: 'robot' },
  { phrases: ['set destination', 'set goal', 'place goal', 'goal tool', 'select goal'], tool: 'goal' },
  { phrases: ['route tool', 'path tool', 'select route', 'planning tool', 'flow tool'], tool: 'route' },
  { phrases: ['select tool', 'select mode', 'move tool'], tool: 'select' },
]

/**
 * Deterministic parser — no LLM. Returns unsupported for unrecognized speech.
 * "Create a building" / "add three trees" now creates objects on free ground (see objectCommands.ts);
 * "building tool" / "select building" still just picks the tool.
 */
export function parseVoiceCommand(transcript: string): ParseResult {
  const t = normalizeTranscript(transcript)
  if (!t) return { ok: false, reason: 'empty', transcript }

  // New world, open a saved world, save as a name, resume the last session.
  const worldCommand = parseWorldCommand(t, matchEnvironment)
  if (worldCommand) return { ok: true, command: worldCommand }

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
    // RealmForge Flow
    {
      test: (s) =>
        /\bcreate a new route\b/.test(s) ||
        /\bcreate (a )?route\b/.test(s) ||
        /\bnew route\b/.test(s) ||
        /\bstart (a )?route\b/.test(s) ||
        /\bdraw (a )?route\b/.test(s),
      command: { type: 'FLOW_CREATE_ROUTE' },
    },
    {
      test: (s) => /\badd waypoint( here)?\b/.test(s) || /\bplace waypoint( here)?\b/.test(s),
      command: { type: 'FLOW_ADD_WAYPOINT' },
    },
    {
      test: (s) => /\bfinish route\b/.test(s) || /\bsave route\b/.test(s) || /\bend route\b/.test(s),
      command: { type: 'FLOW_FINISH_ROUTE' },
    },
    {
      test: (s) => /\bcancel route\b/.test(s) || /\bdiscard route\b/.test(s),
      command: { type: 'FLOW_CANCEL_ROUTE' },
    },
    {
      test: (s) =>
        /\brecalculate (all )?routes?\b/.test(s) ||
        /\breplan (all )?routes?\b/.test(s) ||
        /\bvalidate routes?\b/.test(s),
      command: { type: 'FLOW_RECALCULATE' },
    },
    {
      test: (s) => /\bshow routes?\b/.test(s) || /\bdisplay routes?\b/.test(s),
      command: { type: 'FLOW_SHOW_ROUTES' },
    },
    {
      test: (s) => /\bhide routes?\b/.test(s),
      command: { type: 'FLOW_HIDE_ROUTES' },
    },
    {
      test: (s) => /\bpause (all )?agents\b/.test(s) || /\bpause simulation\b/.test(s),
      command: { type: 'FLOW_PAUSE' },
    },
    {
      test: (s) => /\bresume (all )?agents\b/.test(s) || /\bresume simulation\b/.test(s),
      command: { type: 'FLOW_RESUME' },
    },
    {
      test: (s) =>
        /\bsend robot (one |1 )?to (the )?route\b/.test(s) ||
        /\bassign route to robot\b/.test(s) ||
        /\bassign (the )?route\b/.test(s),
      command: { type: 'FLOW_ASSIGN_ROBOT' },
    },
    {
      test: (s) =>
        /\bclear (the )?selected route\b/.test(s) ||
        /\bdelete (the )?selected route\b/.test(s) ||
        /\bremove (the )?selected route\b/.test(s),
      command: { type: 'FLOW_CLEAR_ROUTE' },
    },
    {
      test: (s) =>
        /\bavoid (the )?(selected )?area\b/.test(s) ||
        /\bavoid (the )?main aisle\b/.test(s) ||
        /\bno go zone\b/.test(s) ||
        /\badd no-?go\b/.test(s),
      command: { type: 'FLOW_AVOID_AREA' },
    },
    {
      test: (s) => /\bmake (this|it) (a )?one-?way\b/.test(s) || /\bone-?way (path|lane|route)\b/.test(s),
      command: { type: 'FLOW_MAKE_ONE_WAY' },
    },
  ]

  for (const r of rules) {
    if (r.test(t)) return { ok: true, command: r.command }
  }

  // "open harbor" with no environment by that name: try the saved worlds.
  const openSaved = parseOpenSaved(t)
  if (openSaved) return { ok: true, command: openSaved }

  // Make, place, move, rotate, resize and copy objects ("add three trees near the robot").
  const objectCommand = parseObjectCommand(t)
  if (objectCommand) return { ok: true, command: objectCommand }

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
