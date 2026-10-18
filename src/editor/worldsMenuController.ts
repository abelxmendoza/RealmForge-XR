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
import { fail, failResult, failSave, guardAsync, guardSync } from '../world/errors'
import { feedbackFromReplace, feedbackFromSave, isWorldMenuBusy, resetWorldMenuBusy, withBusy, type WorldMenuFeedback } from './worldMenuCore'

export type WorldsMenuFeedback = WorldMenuFeedback

/** Busy is shared with the other world menu (see worldMenuCore.ts). */
export const isWorldsMenuBusy = isWorldMenuBusy
export const resetWorldsMenuController = resetWorldMenuBusy

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
