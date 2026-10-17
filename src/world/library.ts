import { useWorld } from './store'
import { WORLD } from './types'
import { isEnvironmentId, listEnvironments, loadEnvironment, normalizeEnvironmentId, useEnvironment, type EnvironmentId } from './environment'
import { cleanName } from './serialize'
import { confirmReplace as sharedConfirm } from './confirmation'
import {
  copySavedWorld,
  deleteSavedWorld,
  listSavedWorlds,
  loadSavedWorld,
  renameSavedWorld,
  replaceWorld,
  saveWorld,
  thumbnailKey,
  useWorldLibrary,
  type ConfirmFn,
  type Result,
  type SaveResult,
  type SavedWorldMeta,
} from './persistence'
import { failSave, safeConfirm, toErrorMessage } from './errors'

/**
 * World library: the "make a new world / pick up a saved one" layer on top of persistence.
 *
 * - Templates are starting points (a blank board or one of the environments).
 * - createWorld() starts from a template AND saves it straight away as a new library entry,
 *   so every world the user makes shows up in the library, not just the three presets.
 * - Each saved world can carry a small thumbnail, captured from the scene after a save.
 *
 * No React or DOM here except the optional thumbnail storage; UI (desktop palette, VR palette,
 * voice) calls these functions.
 */

export type TemplateId = 'blank' | EnvironmentId

export interface WorldTemplate {
  id: TemplateId
  name: string
  description: string
}

export const BLANK_TEMPLATE: WorldTemplate = {
  id: 'blank',
  name: 'Empty',
  description: 'An empty board: build anything from scratch.',
}

/** Every starting point: blank first, then the environments. */
export function listTemplates(): WorldTemplate[] {
  return [BLANK_TEMPLATE, ...listEnvironments().filter((env) => env.id !== 'empty-event-venue')]
}

export interface CreateWorldOptions {
  /** Asked before replacing a non-empty active world. Defaults to the shared confirmation dialog (desktop and VR palette). */
  confirmReplace?: ConfirmFn
}

/** "My world", "My world 2", … — first name not already used in the library. */
export function nextWorldName(base = 'My world', names: string[] = listSavedWorlds().map((w) => w.name)): string {
  const taken = new Set(names.map((n) => n.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/**
 * Start a new world from a template and save it as a new library entry (it becomes the active save).
 * Asks before replacing a non-empty world. Returns the saved entry.
 */
export async function createWorld(name: string, template: TemplateId = 'blank', opts: CreateWorldOptions = {}): Promise<SaveResult> {
  try {
    const label = cleanName(name, nextWorldName())
    const count = Object.keys(useWorld.getState().objects).length + Object.keys(useWorld.getState().actors).length
    if (count > 0) {
      const gate = await safeConfirm(
        opts.confirmReplace ?? sharedConfirm,
        `Start a new world "${label}"?\n\nThe current world (${count} objects) will be replaced. Save it first if you want to keep it.`,
      )
      if (!gate.ok) return failSave(gate.error, Boolean(gate.cancelled))
    }

    if (template === 'blank') {
      const r = await replaceWorld({ name: label, objects: [], robotEnabled: false, robotStart: [0, WORLD.half * 0.5], goal: null }, { confirmReplace: () => true })
      if (!r.ok) return failSave(r.error, Boolean(r.cancelled))
      useEnvironment.getState().setActive(null)
    } else {
      const envId = normalizeEnvironmentId(template) ?? (isEnvironmentId(template) ? template : null)
      if (!envId) return failSave(`Unknown template: ${String(template)}`)
      const r = await loadEnvironment(envId, { confirmReplace: () => true })
      if (!r.ok) return failSave(r.error, Boolean(r.cancelled))
    }
    return saveWorld(label)
  } catch (e) {
    return failSave(`Could not create world: ${toErrorMessage(e)}`)
  }
}

/**
 * Swap in a template without saving it (the start screen uses this before any editing).
 * Replaces the current world without asking, so only call it when nothing would be lost.
 */
export async function startFromTemplate(template: TemplateId): Promise<{ ok: true } | { ok: false; error: string }> {
  if (template === 'blank') {
    const r = await replaceWorld({ name: 'Blank world', objects: [], robotEnabled: false, robotStart: [0, WORLD.half * 0.5], goal: null }, { confirmReplace: () => true })
    if (!r.ok) return r
    useEnvironment.getState().setActive(null)
    return { ok: true }
  }
  if (!isEnvironmentId(template)) return { ok: false, error: `Unknown template: ${template}` }
  const r = await loadEnvironment(template, { confirmReplace: () => true })
  return r.ok ? { ok: true } : r
}

/** Open a saved world from the library (asks before replacing a non-empty world). */
export const openWorld = (id: string, opts: CreateWorldOptions = {}) =>
  loadSavedWorld(id, { confirmReplace: opts.confirmReplace ?? sharedConfirm })

/** Copy a saved world as a new entry; the active world is not touched. */
export const duplicateWorld = (id: string, name?: string): SaveResult => copySavedWorld(id, name)

export const renameWorld = (id: string, name: string): Result => renameSavedWorld(id, name)

/** Delete a saved world and its thumbnail. The active world in the editor is not touched. */
export const deleteWorld = (id: string): Result => deleteSavedWorld(id)

/** Library entries, newest first, optionally filtered by name. */
export function listWorlds(query = ''): SavedWorldMeta[] {
  return filterWorlds(listSavedWorlds(), query)
}

/** Pure name filter (safe to call while rendering). */
export function filterWorlds(worlds: SavedWorldMeta[], query: string): SavedWorldMeta[] {
  const q = query.trim().toLowerCase()
  return q ? worlds.filter((w) => w.name.toLowerCase().includes(q)) : worlds
}

// ---------- thumbnails ----------

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Data URL of a saved world's thumbnail, or null. */
export function getThumbnail(id: string): string | null {
  try {
    return storage()?.getItem(thumbnailKey(id)) ?? null
  } catch {
    return null
  }
}

/** Store a thumbnail. Failures (full storage) are ignored: thumbnails are optional. */
export function setThumbnail(id: string, dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > 60_000) return false
  try {
    storage()?.setItem(thumbnailKey(id), dataUrl)
    thumbVersion.n++
    useWorldLibrary.setState({}) // nudge subscribers so cards re-read the image
    return true
  } catch {
    return false
  }
}

/** Bumped whenever a thumbnail changes; UI can use it as a cache key. */
export const thumbVersion = { n: 0 }

type Capture = () => string | null
let capture: Capture | null = null

/** The scene registers how to grab a small image of the current view (see scene/ThumbnailCapture.tsx). */
export function registerThumbnailCapture(fn: Capture | null) {
  capture = fn
}

/** Capture the current view as the active save's thumbnail. */
export function captureActiveThumbnail(): boolean {
  const { activeId } = useWorldLibrary.getState()
  if (!activeId || !capture) return false
  const url = capture()
  return url ? setThumbnail(activeId, url) : false
}

let tracking = false
/**
 * After any save (from any UI: library, panel, Ctrl+S, VR palette, voice) refresh that world's
 * thumbnail; after opening a world that has none, make one. Call once (the scene does).
 */
export function installThumbnailTracking(schedule: (fn: () => void) => void = (fn) => setTimeout(fn, 250)): () => void {
  if (tracking) return () => undefined
  tracking = true
  const savedAt = (s: ReturnType<typeof useWorldLibrary.getState>) => s.worlds.find((w) => w.id === s.activeId)?.savedAt
  const unsub = useWorldLibrary.subscribe((s, prev) => {
    if (!s.activeId) return
    const saved = savedAt(s) !== savedAt(prev) && savedAt(s) !== undefined
    const opened = s.activeId !== prev.activeId && !getThumbnail(s.activeId)
    if (saved || opened) schedule(captureActiveThumbnail)
  })
  return () => {
    unsub()
    tracking = false
  }
}
