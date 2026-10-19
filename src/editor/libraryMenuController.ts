import {
  createWorld,
  deleteWorld,
  duplicateWorld,
  openWorld,
  renameWorld,
  type TemplateId,
} from '../world/library'
import { importWorld, quickSave, saveWorld, type ConfirmReplace, type ReplaceResult, type Result, type SaveResult } from '../world/persistence'
import { fail, failResult, failSave, guardAsync, guardSync } from '../world/errors'
import { feedbackFromReplace, feedbackFromSave, isWorldMenuBusy, resetWorldMenuBusy, withBusy, type WorldMenuFeedback } from './worldMenuCore'

export type LibraryMenuFeedback = WorldMenuFeedback

/** Busy is shared with the other world menu (see worldMenuCore.ts). */
export const isLibraryMenuBusy = isWorldMenuBusy
export const resetLibraryMenuController = resetWorldMenuBusy

export async function menuCreateWorld(name: string, template: TemplateId = 'blank', confirmReplace?: ConfirmReplace) {
  return withBusy('Create', async () => {
    const result = await guardAsync(() => createWorld(name, template, { confirmReplace }), 'Could not create world')
    return { result, feedback: feedbackFromSave(result as SaveResult, 'Created') }
  })
}

export async function menuOpenWorld(id: string, confirmReplace?: ConfirmReplace) {
  return withBusy('Open', async () => {
    const result = await guardAsync(() => openWorld(id, { confirmReplace }), 'Open failed')
    return { result, feedback: feedbackFromReplace(result as ReplaceResult, 'Opened world.') }
  })
}

export async function menuDuplicateWorld(id: string, name?: string) {
  return withBusy('Copy', async () => {
    const result = guardSync(() => duplicateWorld(id, name), 'Copy failed')
    return { result, feedback: feedbackFromSave(result as SaveResult, 'Copied') }
  })
}

export async function menuRenameWorld(id: string, name: string) {
  return withBusy<Result>('Rename', async () => {
    const result = guardSync(() => renameWorld(id, name), 'Rename failed') as Result
    if (!result.ok) return { result, feedback: { kind: 'error' as const, message: result.error } }
    return { result, feedback: { kind: 'ok' as const, message: `Renamed to "${name.trim() || 'Untitled world'}".` } }
  })
}

export async function menuDeleteWorld(id: string, label: string) {
  return withBusy<Result>('Delete', async () => {
    const result = guardSync(() => deleteWorld(id), 'Delete failed') as Result
    if (!result.ok) return { result, feedback: { kind: 'error' as const, message: result.error } }
    return { result, feedback: { kind: 'ok' as const, message: `Deleted "${label}".` } }
  })
}

export async function menuLibraryQuickSave(name?: string, confirmOverwrite?: ConfirmReplace) {
  return withBusy('Save', async () => {
    const result = await guardAsync(() => quickSave(name, { confirmOverwrite }), 'Save failed')
    return { result, feedback: feedbackFromSave(result as SaveResult) }
  })
}

export async function menuLibrarySaveAsNew(name: string) {
  return withBusy('Save', async () => {
    const result = guardSync(() => saveWorld(name), 'Save failed')
    return { result, feedback: feedbackFromSave(result as SaveResult) }
  })
}

export async function menuLibraryImport(source: File | Blob | string, confirmReplace?: ConfirmReplace) {
  return withBusy('Import', async () => {
    const result = await guardAsync(() => importWorld(source, { confirmReplace }), 'Import failed')
    return { result, feedback: feedbackFromReplace(result as ReplaceResult, 'Imported world.') }
  })
}

/** Test helpers — produce typed failures without touching storage. */
export const __test = { fail, failResult, failSave }
