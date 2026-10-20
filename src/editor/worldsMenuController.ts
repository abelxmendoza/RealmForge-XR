import { readPerceptionScan, type ScanFile } from '../scans/perceptionScan'
import {
  deleteSavedWorld,
  downloadWorld,
  importWorld,
  loadSavedWorld,
  quickSave,
  renameSavedWorld,
  saveWorld,
  type ConfirmReplace,
  type ReplaceResult,
  type Result,
  type SaveResult,
} from '../world/persistence'
import { fail, failResult, failSave, guardAsync, guardSync, toErrorMessage } from '../world/errors'

export type WorldsMenuFeedback =
  | { kind: 'idle' }
  | { kind: 'busy'; action: string }
  | { kind: 'ok'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

let busy = false

export function isWorldsMenuBusy(): boolean {
  return busy
}

export function resetWorldsMenuController() {
  busy = false
}

function feedbackFromReplace(result: ReplaceResult, done: string): WorldsMenuFeedback {
  if (result.ok) {
    return {
      kind: 'ok',
      message: result.warnings.length ? `${done} with ${result.warnings.length} fix(es): ${result.warnings[0]}` : done,
    }
  }
  if (result.cancelled) return { kind: 'cancelled' }
  return { kind: 'error', message: result.error }
}

function feedbackFromSave(result: SaveResult, verb = 'Saved'): WorldsMenuFeedback {
  if (result.ok) return { kind: 'ok', message: `${verb} "${result.value.name}".` }
  if (result.cancelled) return { kind: 'cancelled' }
  return { kind: 'error', message: result.error }
}

async function withBusy<T>(action: string, run: () => Promise<{ result: T; feedback: WorldsMenuFeedback }>) {
  if (busy) {
    return {
      result: fail('Another world action is already running. Wait for it to finish.') as T,
      feedback: { kind: 'error' as const, message: 'Another world action is already running. Wait for it to finish.' },
    }
  }
  busy = true
  try {
    return await run()
  } catch (error) {
    return {
      result: fail(`${action} crashed: ${toErrorMessage(error)}`) as T,
      feedback: { kind: 'error' as const, message: `${action} crashed: ${toErrorMessage(error)}` },
    }
  } finally {
    busy = false
  }
}

export async function menuSaveWorld(name: string, opts?: { overwriteId?: string; confirmed?: boolean }) {
  return withBusy('Save', async () => {
    const result = guardSync(() => saveWorld(name, opts), 'Save failed')
    return { result, feedback: feedbackFromSave(result as SaveResult, opts?.overwriteId ? 'Updated' : 'Saved') }
  })
}

export async function menuQuickSave(name?: string, confirmOverwrite?: ConfirmReplace) {
  return withBusy('Save', async () => {
    const result = await guardAsync(() => quickSave(name, { confirmOverwrite }), 'Save failed')
    return { result, feedback: feedbackFromSave(result as SaveResult) }
  })
}

export async function menuLoadSavedWorld(id: string, confirmReplace?: ConfirmReplace) {
  return withBusy('Load', async () => {
    const result = await guardAsync(() => loadSavedWorld(id, { confirmReplace }), 'Load failed')
    return { result, feedback: feedbackFromReplace(result as ReplaceResult, 'Loaded world.') }
  })
}

export async function menuImportWorld(source: File | Blob | string, confirmReplace?: ConfirmReplace) {
  return withBusy('Import', async () => {
    const result = await guardAsync(() => importWorld(source, { confirmReplace }), 'Import failed')
    const label = typeof source === 'string' ? 'JSON' : 'file' in source || source instanceof Blob ? 'file' : 'world'
    return { result, feedback: feedbackFromReplace(result as ReplaceResult, `Imported ${label}.`) }
  })
}

export async function menuRenameSavedWorld(id: string, name: string) {
  return withBusy<Result>('Rename', async () => {
    const result = guardSync(() => renameSavedWorld(id, name), 'Rename failed') as Result
    if (!result.ok) return { result, feedback: { kind: 'error' as const, message: result.error } }
    return { result, feedback: { kind: 'ok' as const, message: `Renamed to "${name.trim() || 'Untitled world'}".` } }
  })
}

export async function menuDeleteSavedWorld(id: string, label: string) {
  return withBusy<Result>('Delete', async () => {
    const result = guardSync(() => deleteSavedWorld(id), 'Delete failed') as Result
    if (!result.ok) return { result, feedback: { kind: 'error' as const, message: result.error } }
    return { result, feedback: { kind: 'ok' as const, message: `Deleted "${label}".` } }
  })
}

export async function menuDownloadWorld(name?: string) {
  return withBusy<Result>('Export', async () => {
    const result = guardSync(() => downloadWorld(name), 'Export failed') as Result
    if (!result.ok) return { result, feedback: { kind: 'error' as const, message: result.error } }
    return { result, feedback: { kind: 'ok' as const, message: 'Exported JSON.' } }
  })
}

/** Test helpers — produce typed failures without touching storage. */
export const __test = { fail, failResult, failSave }

/** Uses the same busy lock and replace confirmation as normal world imports. */
export async function menuImportScan(files: readonly ScanFile[], confirmReplace?: ConfirmReplace) {
  return withBusy('Import scan', async () => {
    const scan = await readPerceptionScan(files)
    const result = await importWorld(JSON.stringify(scan.world), { confirmReplace })
    if (result.ok) result.warnings.push(...scan.warnings)
    return { result, feedback: feedbackFromReplace(result, 'Imported scan map') }
  })
}
