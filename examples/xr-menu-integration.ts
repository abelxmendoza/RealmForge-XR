/**
 * Example only — not imported by the app.
 * Sketch of how Emiliano’s XR menu can call the World Action API.
 *
 * Copy patterns into the real XR menu component; replace `showXRConfirm`
 * with an in-headset yes/no panel.
 */

import { worldActions, type EnvironmentId } from '../src/world/actions'

/** Stand-in for an in-headset confirm dialog. */
async function showXRConfirm(message: string): Promise<boolean> {
  // TODO(Emiliano): present message on a 3D panel; resolve true/false from button press.
  console.log('[XR confirm]', message)
  return true
}

const ENV_BUTTONS: { id: EnvironmentId; label: string }[] = [
  { id: 'forge-district', label: 'Forge District' },
  { id: 'mars-outpost', label: 'Mars Outpost' },
  { id: 'warehouse', label: 'Warehouse' },
]

export async function onEnvironmentButton(id: EnvironmentId) {
  const result = await worldActions.loadEnvironment(id, { confirmReplace: showXRConfirm })
  if (!result.ok && !result.cancelled) console.warn('Load failed', result.error)
}

export function onToolButton(tool: 'select' | 'wall' | 'building' | 'goal' | 'robot') {
  worldActions.setTool(tool)
}

/** After a ray hit on the map ground (map-local x,z from groundPoint). */
export function onPlaceAt(tool: 'building' | 'goal' | 'robot', x: number, z: number) {
  if (tool === 'goal') return worldActions.setGoal([x, z])
  if (tool === 'robot') return worldActions.placeRobot([x, z])
  worldActions.createObject({
    kind: 'building',
    position: [x, 0, z],
    size: [2.5, 2.5, 2.5],
    rotationY: 0,
    style: 'industrial',
  })
}

export function onDeleteSelected() {
  const id = worldActions.getSelectedId()
  if (id) worldActions.deleteObject(id)
}

export function onUndo() {
  worldActions.undo()
}
export function onRedo() {
  worldActions.redo()
}

export async function onSaveNamed(name: string) {
  const r = worldActions.saveWorld(name)
  if (!r.ok) console.warn(r.error)
}

export async function onLoadSaved(id: string) {
  await worldActions.loadSavedWorld(id, { confirmReplace: showXRConfirm })
}

/** Call once when opening the Worlds submenu. */
export function refreshSaveList() {
  return worldActions.listSavedWorlds()
}

// Silence unused in this sketch
void ENV_BUTTONS
void onEnvironmentButton
void onToolButton
void onPlaceAt
void onDeleteSelected
void onUndo
void onRedo
void onSaveNamed
void onLoadSaved
void refreshSaveList
