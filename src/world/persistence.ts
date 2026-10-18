import { actorsForSave } from '../actors/runtime'
import { flowSnapshot, loadFlowSnapshot } from '../flow/controller'
import { useFlow } from '../flow/store'
import { useEnvironment } from './environment'
import { confirmReplace } from './confirmation'
import { create } from 'zustand'
import { idFor, useWorld } from './store'
import { cleanName, parseWorld, serializeWorld, worldToJSON, type ParsedWorld, type WorldFile } from './serialize'
import { clearHistory, withHistorySuppressed } from './history'
import { describeStorageError, fail, failResult, failSave, safeConfirm, toErrorMessage } from './errors'

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
export type SaveResult = { ok: true; value: SavedWorldMeta } | { ok: false; error: string; cancelled?: boolean }
export type ReplaceResult = { ok: true; warnings: string[] } | { ok: false; error: string; cancelled?: boolean }

export type ConfirmFn = (message: string) => boolean | Promise<boolean>
/** @deprecated Prefer ConfirmFn — same signature. */
export type ConfirmReplace = ConfirmFn
export interface ReplaceOptions {
  /** Called before replacing a non-empty world. Return false to cancel. */
  confirmReplace?: ConfirmFn
}
export interface SaveOptions {
  /** Update this saved world instead of creating a new entry. Requires `confirmed: true`. */
  overwriteId?: string
  /**
   * Must be true when `overwriteId` is set. Enforces "never overwrite without confirmation":
   * callers ask the user first, then pass `{ overwriteId, confirmed: true }`.
   */
  confirmed?: boolean
}

const INDEX_KEY = 'realmforge.worlds.v1'
const worldKey = (id: string) => `realmforge.world.v1.${id}`
/** Small preview image per saved world (written by world/library.ts). */
export const thumbnailKey = (id: string) => `realmforge.thumb.v1.${id}`

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
  const { objects, robotStart, goal, robotEnabled } = useWorld.getState()
  const ids = Object.keys(objects).sort()
  const flow = flowSnapshot()
  return JSON.stringify({
    objects: ids.map((id) => objects[id]),
    robotEnabled,
    robotStart,
    goal,
    actors: Object.values(useWorld.getState().actors).sort((a, b) => a.id.localeCompare(b.id)),
    routes: flow.routes.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      waypoints: r.waypoints,
      assignedAgentIds: r.assignedAgentIds,
      visible: r.visible,
    })),
    trafficZones: flow.trafficZones,
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
  const unsubWorld = useWorld.subscribe(() => refreshDirty())
  const unsubFlow = useFlow.subscribe(() => refreshDirty())
  return () => {
    unsubWorld()
    unsubFlow()
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

const describe = describeStorageError

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
  const { objects, robotStart, goal, robotEnabled } = useWorld.getState()
  const flow = flowSnapshot()
  const file = serializeWorld(
    {
      objects,
      robotStart,
      goal,
      robotEnabled,
      actors: actorsForSave(),
      routes: flow.routes,
      trafficZones: flow.trafficZones,
    },
    name,
  )
  const environmentId = useEnvironment.getState().activeId
  return environmentId ? { ...file, environmentId } : file
}

async function confirmIfNeeded(
  message: string,
  opts: ReplaceOptions,
): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  const count = Object.keys(useWorld.getState().objects).length + Object.keys(useWorld.getState().actors).length
  if (count === 0) return { ok: true }
  return safeConfirm(
    opts.confirmReplace ?? confirmReplace,
    `${message}\n\nThe current world (${count} objects) will be replaced. Unsaved changes are lost.`,
  )
}

/**
 * Install a validated world as the active world. store.loadWorld bumps geometry and robot
 * versions, so navigation rebuilds its grid, moves the robot to robotStart and replans.
 */
function applyWorld(world: ParsedWorld, activeId: string | null) {
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld(world)
  })
  loadFlowSnapshot(world.flow ?? { routes: [], trafficZones: [] })
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
 * Save the active world as a NEW entry. Never overwrites unless both `overwriteId` and
 * `confirmed: true` are passed (callers must ask the user first).
 */
export function saveWorld(name: string, opts: SaveOptions = {}): SaveResult {
  try {
    const s = storage()
    if (!s) return failSave('Browser storage is not available here. Use Export instead.')
    if (opts.overwriteId && !opts.confirmed) {
      return failSave('Overwrite requires confirmation. Ask the user, then pass { overwriteId, confirmed: true }.')
    }
    if (opts.overwriteId && typeof opts.overwriteId !== 'string') {
      return failSave('Invalid overwrite id.')
    }
    const index = readIndex()
    if (opts.overwriteId && !index.some((m) => m.id === opts.overwriteId)) return failSave('That saved world no longer exists.')
    const id = opts.overwriteId ?? newSaveId()
    const file = currentWorldFile(cleanName(name))
    const meta: SavedWorldMeta = { id, name: file.name, savedAt: file.savedAt, objectCount: file.objects.length + (file.actors?.length ?? 0) }
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
      return failSave(describe(e))
    }
    useWorldLibrary.setState({ activeId: id, activeName: meta.name })
    markClean()
    return { ok: true, value: meta }
  } catch (e) {
    return failSave(`Save failed: ${toErrorMessage(e)}`)
  }
}

/**
 * Ctrl+S helper: save as new when there is no active save; otherwise ask before overwriting.
 * Pass `confirmOverwrite` from XR (defaults to `window.confirm` on desktop).
 */
export async function quickSave(name?: string, opts: { confirmOverwrite?: ConfirmFn } = {}): Promise<SaveResult> {
  try {
    const { activeId, activeName } = useWorldLibrary.getState()
    const label = name ?? activeName
    if (!activeId) return saveWorld(label)
    const ask =
      opts.confirmOverwrite ??
      ((m: string) => (typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(m) : false))
    const gate = await safeConfirm(ask, `Overwrite the saved world "${activeName}" with the current world?`, 'Overwrite confirmation unavailable.')
    if (!gate.ok) return failSave(gate.error, Boolean(gate.cancelled))
    return saveWorld(label, { overwriteId: activeId, confirmed: true })
  } catch (e) {
    return failSave(`Save failed: ${toErrorMessage(e)}`)
  }
}

/** Replace the active world with a saved one (asks first if the current world is not empty). */
export async function loadSavedWorld(id: string, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  try {
    if (typeof id !== 'string' || !id.trim()) return fail('That saved world no longer exists.')
    const s = storage()
    if (!s) return fail('Browser storage is not available here.')
    let raw: string | null
    try {
      raw = s.getItem(worldKey(id))
    } catch (e) {
      return fail(describe(e))
    }
    if (raw === null) return fail('That saved world no longer exists.')
    const parsed = parseWorld(raw, idFor)
    if (!parsed.ok) return fail(`Saved world is damaged: ${parsed.error}`)
    const gate = await confirmIfNeeded(`Load "${parsed.world.name}"?`, opts)
    if (!gate.ok) return gate
    applyWorld(parsed.world, id)
    return { ok: true, warnings: parsed.warnings }
  } catch (e) {
    return fail(`Load failed: ${toErrorMessage(e)}`)
  }
}

export function renameSavedWorld(id: string, name: string): Result {
  try {
    const s = storage()
    if (!s) return failResult('Browser storage is not available here.')
    const index = readIndex()
    const meta = index.find((m) => m.id === id)
    if (!meta) return failResult('That saved world no longer exists.')
    const clean = cleanName(name, meta.name)
    try {
      const raw = s.getItem(worldKey(id))
      if (raw) {
        const file = JSON.parse(raw)
        if (!file || typeof file !== 'object') return failResult('Saved world is damaged and cannot be renamed.')
        file.name = clean
        s.setItem(worldKey(id), JSON.stringify(file))
      }
      writeIndex(index.map((m) => (m.id === id ? { ...m, name: clean } : m)))
    } catch (e) {
      return failResult(describe(e))
    }
    if (useWorldLibrary.getState().activeId === id) useWorldLibrary.setState({ activeName: clean })
    return { ok: true }
  } catch (e) {
    return failResult(`Rename failed: ${toErrorMessage(e)}`)
  }
}

/**
 * Copy a saved world into a NEW saved entry without touching the active world.
 * The copy keeps the original's thumbnail.
 */
export function copySavedWorld(id: string, name?: string): SaveResult {
  try {
    if (typeof id !== 'string' || !id.trim()) return failSave('That saved world no longer exists.')
    const s = storage()
    if (!s) return failSave('Browser storage is not available here.')
    const index = readIndex()
    const meta = index.find((m) => m.id === id)
    let raw: string | null = null
    try {
      raw = s.getItem(worldKey(id))
    } catch (e) {
      return failSave(describe(e))
    }
    if (!meta || raw === null) return failSave('That saved world no longer exists.')
    const parsed = parseWorld(raw, idFor)
    if (!parsed.ok) return failSave(`Saved world is damaged: ${parsed.error}`)
    const file = serializeWorld(parsed.world, cleanName(name, `Copy of ${meta.name}`))
    if (parsed.world.environmentId) file.environmentId = parsed.world.environmentId
    const copy: SavedWorldMeta = {
      id: newSaveId(),
      name: file.name,
      savedAt: file.savedAt,
      objectCount: file.objects.length + (file.actors?.length ?? 0),
    }
    try {
      s.setItem(worldKey(copy.id), JSON.stringify(file))
      const thumb = s.getItem(thumbnailKey(id))
      if (thumb) s.setItem(thumbnailKey(copy.id), thumb)
      writeIndex([...index, copy])
    } catch (e) {
      try {
        s.removeItem(worldKey(copy.id))
        s.removeItem(thumbnailKey(copy.id))
      } catch {
        // ignore
      }
      return failSave(describe(e))
    }
    return { ok: true, value: copy }
  } catch (e) {
    return failSave(`Copy failed: ${toErrorMessage(e)}`)
  }
}

/** Delete a saved world. The active world in the editor is not touched. */
export function deleteSavedWorld(id: string): Result {
  try {
    if (typeof id !== 'string' || !id.trim()) return failResult('That saved world no longer exists.')
    const s = storage()
    if (!s) return failResult('Browser storage is not available here.')
    try {
      s.removeItem(worldKey(id))
      s.removeItem(thumbnailKey(id))
      writeIndex(readIndex().filter((m) => m.id !== id))
    } catch (e) {
      return failResult(describe(e))
    }
    if (useWorldLibrary.getState().activeId === id) useWorldLibrary.setState({ activeId: null })
    return { ok: true }
  } catch (e) {
    return failResult(`Delete failed: ${toErrorMessage(e)}`)
  }
}

/** The active world as portable JSON plus a suggested file name. */
export function exportWorld(name?: string): { json: string; filename: string } {
  const file = currentWorldFile(name)
  const slug = file.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world'
  return { json: worldToJSON(file), filename: `${slug}.realmforge.json` }
}

/** Browser helper: export and trigger a download. Never throws. */
export function downloadWorld(name?: string): Result {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return failResult('Downloads are not available in this environment.')
    }
    const { json, filename } = exportWorld(name)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
    }, 1000)
    return { ok: true }
  } catch (e) {
    return failResult(`Download failed: ${toErrorMessage(e)}`)
  }
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** Import a world from a File (file picker / drop) or a JSON string. Validates, asks, then loads. */
export async function importWorld(source: File | Blob | string, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  try {
    let text: string
    if (typeof source === 'string') text = source
    else {
      if (typeof source.size === 'number' && source.size > MAX_IMPORT_BYTES) {
        return fail('File is too large to be a world (limit 5 MB).')
      }
      try {
        text = await source.text()
      } catch (e) {
        return fail(`Could not read the file: ${toErrorMessage(e)}`)
      }
    }
    if (typeof text !== 'string' || !text.trim()) return fail('Not valid JSON.')
    const parsed = parseWorld(text, idFor)
    if (!parsed.ok) return parsed
    const gate = await confirmIfNeeded(`Import "${parsed.world.name}"?`, opts)
    if (!gate.ok) return gate
    applyWorld(parsed.world, null)
    return { ok: true, warnings: parsed.warnings }
  } catch (e) {
    return fail(`Import failed: ${toErrorMessage(e)}`)
  }
}

/** Load a world that is already validated in memory (e.g. a preset), with the same confirmation. */
export async function replaceWorld(world: ParsedWorld, opts: ReplaceOptions = {}): Promise<ReplaceResult> {
  try {
    if (!world || typeof world !== 'object' || !Array.isArray(world.objects)) {
      return fail('Invalid world snapshot.')
    }
    const gate = await confirmIfNeeded(`Load "${world.name ?? 'world'}"?`, opts)
    if (!gate.ok) return gate
    applyWorld(world, null)
    return { ok: true, warnings: [] }
  } catch (e) {
    return fail(`Replace failed: ${toErrorMessage(e)}`)
  }
}
