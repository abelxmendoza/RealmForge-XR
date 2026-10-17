import { useEnvironment } from './environment'
import { confirmReplace } from './confirmation'
import { create } from 'zustand'
import { idFor, useWorld } from './store'
import { cleanName, parseWorld, serializeWorld, worldToJSON, type ParsedWorld, type WorldFile } from './serialize'
import { clearHistory, withHistorySuppressed } from './history'

/**
 * World management API: save / load / rename / delete worlds in browser storage, and
 * export / import portable JSON files. No React and no UI here, so the XR menu and the
 * desktop UI can both call these functions. UI can subscribe to `useWorldLibrary` for the list.
 *
 * Every function that could replace the active world asks `confirmReplace` first when the
 * current world has objects. Pass your own (e.g. an XR dialog); without a UI consumer, replacement is denied.
 */

export interface SavedWorldMeta {
  id: string
  name: string
  savedAt: string
  objectCount: number
}

export type Result = { ok: true } | { ok: false; error: string }
export type SaveResult = { ok: true; value: SavedWorldMeta } | { ok: false; error: string }
export type ReplaceResult = { ok: true; warnings: string[] } | { ok: false; error: string; cancelled?: boolean }

export type ConfirmReplace = (message: string) => boolean | Promise<boolean>
export interface ReplaceOptions {
  /** Called before replacing a non-empty world. Return false to cancel. */
  confirmReplace?: ConfirmReplace
}

const INDEX_KEY = 'realmforge.worlds.v1'
const worldKey = (id: string) => `realmforge.world.v1.${id}`

interface LibraryState {
  worlds: SavedWorldMeta[]
  /** The saved world the active world came from or was last saved as (null = unsaved). */
  activeId: string | null
  activeName: string
  /** True when the active world differs from the last save / load / markClean point. */
  dirty: boolean
}

/** Reactive view of the library for UI. Mutate only through the functions below. */
export const useWorldLibrary = create<LibraryState>(() => ({
  worlds: [],
  activeId: null,
  activeName: 'Untitled world',
  dirty: false,
}))

/** Stable fingerprint of world data (no name / savedAt) for dirty detection. */
export function worldFingerprint(): string {
  const { objects, robotStart, goal } = useWorld.getState()
  const ids = Object.keys(objects).sort()
  return JSON.stringify({
    objects: ids.map((id) => objects[id]),
    robotStart,
    goal,
  })
}

let cleanFingerprint = worldFingerprint()

export function markClean() {
  cleanFingerprint = worldFingerprint()
  if (useWorldLibrary.getState().dirty) useWorldLibrary.setState({ dirty: false })
}

export function refreshDirty() {
  const dirty = worldFingerprint() !== cleanFingerprint
  if (useWorldLibrary.getState().dirty !== dirty) useWorldLibrary.setState({ dirty })
}

let dirtyListening = false

/** Keep `dirty` in sync with store edits. Call once from app boot. */
export function installDirtyTracking(): () => void {
  if (dirtyListening) return () => undefined
  dirtyListening = true
  // Baseline = whatever is in the store at boot (default starter world).
  markClean()
  const unsub = useWorld.subscribe(() => refreshDirty())
  return () => {
    unsub()
    dirtyListening = false
  }
}

// ---------- storage access (graceful when localStorage is missing, blocked or full) ----------

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage
    return s ?? null
  } catch {
    return null
  }
}

function describe(e: unknown) {
  const name = (e as { name?: string })?.name
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return 'Browser storage is full. Delete a saved world or export it to a file.'
  return `Browser storage error: ${(e as Error)?.message ?? String(e)}`
}

function readIndex(): SavedWorldMeta[] {
  const s = storage()
  if (!s) return []
  try {
    const raw = JSON.parse(s.getItem(INDEX_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string') : []
  } catch {
    return []
  }
}

function writeIndex(list: SavedWorldMeta[]) {
  storage()!.setItem(INDEX_KEY, JSON.stringify(list))
  useWorldLibrary.setState({ worlds: sortByDate(list) })
}

const sortByDate = (list: SavedWorldMeta[]) => [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
const newSaveId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ---------- current world ----------

/** The active world as a WorldFile (what save and export write). */
export function currentWorldFile(name = useWorldLibrary.getState().activeName): WorldFile {
  const { objects, robotStart, goal } = useWorld.getState()
  const file = serializeWorld({ objects, robotStart, goal }, name)
  const environmentId = useEnvironment.getState().activeId
  return environmentId ? { ...file, environmentId } : file
}

async function confirmIfNeeded(message: string, opts: ReplaceOptions): Promise<boolean> {
  const count = Object.keys(useWorld.getState().objects).length
  if (count === 0) return true
  const ask = opts.confirmReplace ?? confirmReplace
  return ask(`${message}\n\nThe current world (${count} objects) will be replaced. Unsaved changes are lost.`)
}

/**
 * Install a validated world as the active world. store.loadWorld bumps geometry and robot
 * versions, so navigation rebuilds its grid, moves the robot to robotStart and replans.
 */
function applyWorld(world: ParsedWorld, activeId: string | null) {
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld(world)
  })
  clearHistory()
  useEnvironment.getState().setActive(world.environmentId ?? null)
  useWorldLibrary.setState({ activeId, activeName: world.name })
  markClean()
}

// ---------- public API ----------

/** Refresh and return the list of saved worlds (newest first). */
export function listSavedWorlds(): SavedWorldMeta[] {
  const list = sortByDate(readIndex())
  useWorldLibrary.setState({ worlds: list })
  return list
}

/**
 * Save the active world as a NEW entry. Never overwrites: to update an existing save,
 * pass `{ overwriteId }` explicitly (e.g. after asking the user).
 */
export function saveWorld(name: string, opts: { overwriteId?: string } = {}): SaveResult {
  const s = storage()
  if (!s) return { ok: false, error: 'Browser storage is not available here. Use Export instead.' }
  const index = readIndex()
  if (opts.overwriteId && !index.some((m) => m.id === opts.overwriteId)) return { ok: false, error: 'That saved world no longer exists.' }
  const id = opts.overwriteId ?? newSaveId()
  const file = currentWorldFile(cleanName(name))
  const meta: SavedWorldMeta = { id, name: file.name, savedAt: file.savedAt, objectCount: file.objects.length }
  try {
    s.setItem(worldKey(id), JSON.stringify(file))
    writeIndex([...index.filter((m) => m.id !== id), meta])
  } catch (e) {
    if (!opts.overwriteId) {
      try {
        s.removeItem(worldKey(id))
      } catch {
        // ignore
      }
    }
    return { ok: false, error: describe(e) }
  }
  useWorldLibrary.setState({ activeId: id, activeName: meta.name })
  markClean()
  return { ok: true, value: meta }
}

/**
 * Ctrl+S / quick-save: overwrite the active save when one exists, otherwise save as new
 * under the current name. Never prompts (explicit Update save still confirms in the UI).
 */
export function quickSave(name?: string): SaveResult {
  const { activeId, activeName } = useWorldLibrary.getState()
  const label = name ?? activeName
  if (activeId) return saveWorld(label, { overwriteId: activeId })
  return saveWorld(label)
}

/** Replace the active world with a saved one (asks first if the current world is not empty). */
export async function loadSavedWorld(id: string, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  const s = storage()
  if (!s) return { ok: false, error: 'Browser storage is not available here.' }
  let raw: string | null
  try {
    raw = s.getItem(worldKey(id))
  } catch (e) {
    return { ok: false, error: describe(e) }
  }
  if (raw === null) return { ok: false, error: 'That saved world no longer exists.' }
  const parsed = parseWorld(raw, idFor)
  if (!parsed.ok) return { ok: false, error: `Saved world is damaged: ${parsed.error}` }
  if (!(await confirmIfNeeded(`Load "${parsed.world.name}"?`, opts))) return { ok: false, error: 'Cancelled.', cancelled: true }
  applyWorld(parsed.world, id)
  return { ok: true, warnings: parsed.warnings }
}

export function renameSavedWorld(id: string, name: string): Result {
  const s = storage()
  if (!s) return { ok: false, error: 'Browser storage is not available here.' }
  const index = readIndex()
  const meta = index.find((m) => m.id === id)
  if (!meta) return { ok: false, error: 'That saved world no longer exists.' }
  const clean = cleanName(name, meta.name)
  try {
    const raw = s.getItem(worldKey(id))
    if (raw) {
      const file = JSON.parse(raw)
      file.name = clean
      s.setItem(worldKey(id), JSON.stringify(file))
    }
    writeIndex(index.map((m) => (m.id === id ? { ...m, name: clean } : m)))
  } catch (e) {
    return { ok: false, error: describe(e) }
  }
  if (useWorldLibrary.getState().activeId === id) useWorldLibrary.setState({ activeName: clean })
  return { ok: true }
}

/** Delete a saved world. The active world in the editor is not touched. */
export function deleteSavedWorld(id: string): Result {
  const s = storage()
  if (!s) return { ok: false, error: 'Browser storage is not available here.' }
  try {
    s.removeItem(worldKey(id))
    writeIndex(readIndex().filter((m) => m.id !== id))
  } catch (e) {
    return { ok: false, error: describe(e) }
  }
  if (useWorldLibrary.getState().activeId === id) useWorldLibrary.setState({ activeId: null })
  return { ok: true }
}

/** The active world as portable JSON plus a suggested file name. */
export function exportWorld(name?: string): { json: string; filename: string } {
  const file = currentWorldFile(name)
  const slug = file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world'
  return { json: worldToJSON(file), filename: `${slug}.realmforge.json` }
}

/** Browser helper: export and trigger a download. */
export function downloadWorld(name?: string) {
  const { json, filename } = exportWorld(name)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** Import a world from a File (file picker / drop) or a JSON string. Validates, asks, then loads. */
export async function importWorld(source: File | Blob | string, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  let text: string
  if (typeof source === 'string') text = source
  else {
    if (source.size > MAX_IMPORT_BYTES) return { ok: false, error: 'File is too large to be a world (limit 5 MB).' }
    try {
      text = await source.text()
    } catch (e) {
      return { ok: false, error: `Could not read the file: ${(e as Error).message}` }
    }
  }
  const parsed = parseWorld(text, idFor)
  if (!parsed.ok) return parsed
  if (!(await confirmIfNeeded(`Import "${parsed.world.name}"?`, opts))) return { ok: false, error: 'Cancelled.', cancelled: true }
  applyWorld(parsed.world, null)
  return { ok: true, warnings: parsed.warnings }
}

/** Load a world that is already validated in memory (e.g. a preset), with the same confirmation. */
export async function replaceWorld(world: ParsedWorld, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  if (!(await confirmIfNeeded(`Load "${world.name}"?`, opts))) return { ok: false, error: 'Cancelled.', cancelled: true }
  applyWorld(world, null)
  return { ok: true, warnings: [] }
}
