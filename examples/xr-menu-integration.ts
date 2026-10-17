/**
 * Example only — not imported by the app.
 *
 * Production wiring (already on main):
 * - Wrist menu: `src/editor/WristMenu.tsx` + `WristEnvMenu.tsx`
 * - Immersive palette + Confirm/Cancel: `src/xr/ControlPalette.tsx`
 * - Shared confirms: `src/world/confirmation.ts` via `confirmReplace`
 * - User guide: `src/guide/*` + `src/xr/ControlsGuidePanel.tsx`
 *
 * Prefer those modules over copying this sketch.
 */

import { worldActions, type EnvironmentId } from '../src/world/actions'
import { confirmReplace } from '../src/world/confirmation'

/** Uses the same confirm channel as wrist / palette / desktop dialog. */
export async function onEnvironmentButton(id: EnvironmentId) {
  const result = await worldActions.loadEnvironment(id, { confirmReplace })
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
  await worldActions.loadSavedWorld(id, { confirmReplace })
}

/** Call once when opening the Worlds submenu. */
export function refreshSaveList() {
  return worldActions.listSavedWorlds()
}
