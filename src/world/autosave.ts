import { create } from 'zustand'
import { idFor, useWorld } from './store'
import { parseWorld } from './serialize'
import { currentWorldFile, listSavedWorlds, replaceWorld, useWorldLibrary, type ConfirmFn, type ReplaceResult } from './persistence'

/**
 * Auto-save: quietly keeps the last session in browser storage so a reload, crash or closed tab
 * never loses work. It never replaces the open world by itself; the Worlds library offers
 * "Resume where you left off" and voice can say "resume".
 */

const KEY = 'realmforge.autosave.v1'

export interface AutosaveInfo {
  name: string
  savedAt: string
  objectCount: number
  /** The library entry the session belonged to, if any. */
  activeId: string | null
  /** True when the session had changes that were not saved to the library. */
  unsaved: boolean
}

/** Reactive summary for UI (null = nothing to resume). */
export const useAutosave = create<{ info: AutosaveInfo | null }>(() => ({ info: null }))

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The stored session, if it is present and valid. */
export function readAutosave(): AutosaveInfo | null {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.file || !parseWorld(data.file, idFor).ok) return null
    return { name: data.file.name, savedAt: data.savedAt, objectCount: data.file.objects.length, activeId: data.activeId ?? null, unsaved: !!data.unsaved }
  } catch {
    return null
  }
}

/** Write the open world now. Skips empty worlds so a fresh start never wipes the last session. */
export function writeAutosave(): boolean {
  const s = storage()
  if (!s) return false
  const w = useWorld.getState()
  const actors = (w as { actors?: Record<string, unknown> }).actors
  if (Object.keys(w.objects).length === 0 && (!actors || Object.keys(actors).length === 0)) return false
  const lib = useWorldLibrary.getState()
  const file = currentWorldFile(lib.activeName)
  try {
    s.setItem(KEY, JSON.stringify({ file, savedAt: new Date().toISOString(), activeId: lib.activeId, unsaved: lib.dirty }))
    useAutosave.setState({ info: readAutosave() })
    return true
  } catch {
    // Storage full or blocked: auto-save is best-effort.
    return false
  }
}

export function clearAutosave() {
  try {
    storage()?.removeItem(KEY)
  } catch {
    // ignore
  }
  useAutosave.setState({ info: null })
}

/**
 * Bring back the last session. Asks before replacing a non-empty world.
 * Reconnects it to its library entry so Save updates the right world.
 */
export async function resumeAutosave(opts: { confirmReplace?: ConfirmFn } = {}): Promise<ReplaceResult> {
  const raw = storage()?.getItem(KEY)
  if (!raw) return { ok: false, error: 'Nothing to resume.' }
  let data: { file?: unknown; activeId?: string | null; unsaved?: boolean }
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'The saved session is damaged.' }
  }
  const parsed = parseWorld(data.file, idFor)
  if (!parsed.ok) return { ok: false, error: `The saved session is damaged: ${parsed.error}` }
  const r = await replaceWorld(parsed.world, opts)
  if (!r.ok) return r
  const stillSaved = data.activeId && listSavedWorlds().some((m) => m.id === data.activeId)
  useWorldLibrary.setState({ activeId: stillSaved ? data.activeId! : null, activeName: parsed.world.name, dirty: !!data.unsaved || !stillSaved })
  return { ok: true, warnings: parsed.warnings }
}

let installed = false
/**
 * Save the session a moment after each change, and when the page is hidden or closed.
 * Changes made before this is installed (the boot-time world) are ignored.
 */
export function installAutosave(delayMs = 1500): () => void {
  if (installed) return () => undefined
  installed = true
  useAutosave.setState({ info: readAutosave() })
  let timer: ReturnType<typeof setTimeout> | null = null
  let armed = false
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    if (armed) writeAutosave()
  }
  const unsub = useWorld.subscribe((s, prev) => {
    const changed = s.objects !== prev.objects || s.robotStart !== prev.robotStart || s.goal !== prev.goal || (s as { actors?: unknown }).actors !== (prev as { actors?: unknown }).actors
    if (!changed || s.dragging) return
    armed = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, delayMs)
  })
  const onHide = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') flush()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
  }
  return () => {
    unsub()
    if (timer) clearTimeout(timer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
    installed = false
  }
}
