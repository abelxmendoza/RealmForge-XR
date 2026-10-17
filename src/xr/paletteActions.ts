import { worldActions } from '../world/actions'
import { confirmReplace, requestConfirmation } from '../world/confirmation'
import { replaceWorld, type ReplaceResult, type SaveResult } from '../world/persistence'
import { useWorld } from '../world/store'
import { cycleVariant } from '../world/catalog'
import { createWorld, nextWorldName, type TemplateId } from '../world/library'
import { fail, failSave, toErrorMessage } from '../world/errors'

async function guardPaletteReplace(label: string, run: () => Promise<ReplaceResult>): Promise<ReplaceResult> {
  try {
    return await run()
  } catch (error) {
    return fail(`${label} crashed: ${toErrorMessage(error)}`)
  }
}

async function guardPaletteSave(label: string, run: () => Promise<SaveResult>): Promise<SaveResult> {
  try {
    return await run()
  } catch (error) {
    return failSave(`${label} crashed: ${toErrorMessage(error)}`)
  }
}

export async function loadPaletteEnvironment(id: string) {
  return guardPaletteReplace('Environment load', () => worldActions.loadEnvironment(id, { confirmReplace }))
}
export async function loadPaletteSave(id: string) {
  return guardPaletteReplace('Load save', () => worldActions.loadSavedWorld(id, { confirmReplace }))
}
export async function savePaletteWorld() {
  return guardPaletteSave('Save', () =>
    worldActions.quickSave(undefined, { confirmOverwrite: (message) => requestConfirmation({ type: 'OVERWRITE_SAVE', message }) }),
  )
}
/** Start a new world (auto-named "My world N") and save it to the library straight away. */
export async function createPaletteWorld(template: TemplateId = 'blank') {
  return guardPaletteSave('Create world', () => createWorld(nextWorldName(), template, { confirmReplace }))
}
export async function blankPaletteWorld() {
  return guardPaletteReplace('Blank world', () =>
    replaceWorld({ name: 'Blank world', objects: [], robotStart: [0, 5], goal: null }, { confirmReplace }),
  )
}
export async function deletePaletteSelection() {
  const id = worldActions.getSelectedId()
  if (!id) return
  if (await requestConfirmation({ type: 'DELETE', message: 'Delete the selected object?' })) {
    // Resolve against the original object, never a selection changed during confirmation.
    worldActions.deleteObject(id)
  }
}
export function editPaletteSelection(action: 'rotate-left' | 'rotate-right' | 'grow' | 'shrink' | 'raise' | 'lower' | 'style' | 'roof' | 'duplicate') {
  const id = worldActions.getSelectedId()
  const object = id ? useWorld.getState().objects[id] : null
  if (!object) return
  if (action === 'duplicate') { worldActions.duplicateObject(object.id); return }
  if (action === 'style') { const patch = cycleVariant(object); if (patch) worldActions.updateObject(object.id, patch); return }
  if (action === 'roof') {
    if (object.kind === 'building') worldActions.updateObject(object.id, { roof: object.roof === 'pitched' ? 'flat' : 'pitched' })
    return
  }
  if (action === 'rotate-left' || action === 'rotate-right') {
    worldActions.updateObject(object.id, { rotationY: object.rotationY + (action === 'rotate-left' ? -1 : 1) * Math.PI / 12 })
    return
  }
  const size = [...object.size] as typeof object.size
  if (action === 'raise' || action === 'lower') size[1] = Math.max(0.3, size[1] + (action === 'raise' ? 0.25 : -0.25))
  else { const step = action === 'grow' ? 0.5 : -0.5; size[0] = Math.max(0.5, size[0] + step); size[2] = Math.max(0.5, size[2] + step) }
  worldActions.updateObject(object.id, { size })
}
