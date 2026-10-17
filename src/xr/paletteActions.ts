import { worldActions } from '../world/actions'
import { confirmReplace, requestConfirmation } from '../world/confirmation'
import { replaceWorld } from '../world/persistence'
import { useWorld } from '../world/store'
import { cycleVariant } from '../world/catalog'

export async function loadPaletteEnvironment(id: string) {
  return worldActions.loadEnvironment(id, { confirmReplace })
}
export async function loadPaletteSave(id: string) {
  return worldActions.loadSavedWorld(id, { confirmReplace })
}
export async function savePaletteWorld() {
  return worldActions.quickSave(undefined, { confirmOverwrite: (message) => requestConfirmation({ type: 'OVERWRITE_SAVE', message }) })
}
export async function blankPaletteWorld() {
  return replaceWorld({ name: 'Blank world', objects: [], robotStart: [0, 5], goal: null }, { confirmReplace })
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
