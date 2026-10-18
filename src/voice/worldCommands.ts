import type { EnvironmentId } from '../world/environment'
import type { SavedWorldMeta } from '../world/persistence'
import type { TemplateId } from '../world/library'
import type { VoiceCommand } from './types'

/**
 * Voice grammar for whole worlds:
 *   "go home", "go home now" (escape hatch back to the landing page)
 *   "new world", "start a new Mars world", "new empty world called harbor"
 *   "open my world 2", "open saved world harbor"
 *   "save as harbor town", "save this world as harbor"
 *   "resume", "continue where I left off"
 */
export function parseGoHome(t: string): VoiceCommand | null {
  // Escape hatch first — leave even when confirm UI is stuck.
  if (/\b(go home now|force home|exit now|leave now|force exit)\b/.test(t)) {
    return { type: 'GO_HOME', force: true }
  }
  if (
    /\bgo( back)?( to)? home\b/.test(t) ||
    /\b(back|return) to (the )?(home|landing|start)( page)?\b/.test(t) ||
    /\b(exit|leave|close) (the )?(editor|app)\b/.test(t) ||
    /\bhome page\b/.test(t)
  ) {
    return { type: 'GO_HOME' }
  }
  return null
}

export function parseWorldCommand(t: string, matchEnvironment: (t: string) => EnvironmentId | null): VoiceCommand | null {
  const home = parseGoHome(t)
  if (home) return home
  if (/\b(resume|continue where|pick up where|last session|left off)\b/.test(t)) return { type: 'RESUME_SESSION' }

  const saveAs = /\bsave\b.*?\b(?:as|called|named)\s+(.+)$/.exec(t)
  if (saveAs) return { type: 'SAVE_WORLD', name: titleCase(saveAs[1]) }

  if (/\b(new|fresh)\b.*\b(world|map|level|scene|environment)\b/.test(t) || /\bstart (a |an )?(new|fresh)\b/.test(t)) {
    const named = /\b(?:called|named)\s+(.+)$/.exec(t)
    const before = named ? t.slice(0, named.index) : t
    const env = matchEnvironment(before)
    const template: TemplateId = env ?? 'blank'
    return { type: 'NEW_WORLD', template, ...(named ? { name: titleCase(named[1]) } : {}) }
  }

  // "open my harbor world" / "open saved world harbor": saved worlds win over environments here.
  const open = /^(?:please\s+)?(open|load|go to|switch to)\s+(.+)$/.exec(t)
  if (open && /\b(my|saved)\b/.test(open[2])) return { type: 'OPEN_SAVED_WORLD', query: open[2] }
  return null
}

/** A saved world for "open …" when no environment matched (called by the parser as a fallback). */
export function parseOpenSaved(t: string): VoiceCommand | null {
  const open = /^(?:please\s+)?(open|load|go to|switch to)\s+(.+)$/.exec(t)
  return open ? { type: 'OPEN_SAVED_WORLD', query: open[2] } : null
}

const FILLER = new Set(['my', 'the', 'saved', 'world', 'worlds', 'a', 'please', 'up', 'called', 'named'])
const words = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)

/** Best saved world for a spoken query, or null. Exact phrase first, then shared words. */
export function matchSavedWorld(query: string, worlds: SavedWorldMeta[]): SavedWorldMeta | null {
  const q = words(query).join(' ')
  const byLength = [...worlds].sort((a, b) => b.name.length - a.name.length)
  const exact = byLength.find((w) => {
    const n = words(w.name).join(' ')
    return n && (q.includes(n) || n.includes(q))
  })
  if (exact) return exact
  const qWords = words(query).filter((w) => !FILLER.has(w))
  if (!qWords.length) return null
  let best: SavedWorldMeta | null = null
  let bestScore = 0
  for (const w of worlds) {
    const nWords = words(w.name).filter((x) => !FILLER.has(x))
    const shared = qWords.filter((x) => nWords.includes(x)).length
    const score = nWords.length ? shared / Math.max(nWords.length, qWords.length) : 0
    if (shared > 0 && score > bestScore) {
      best = w
      bestScore = score
    }
  }
  return bestScore >= 0.5 ? best : null
}

const titleCase = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80)
