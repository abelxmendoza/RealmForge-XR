import { useWorld } from '../world/store'
import { pulseDelete } from '../xr/haptics'
import { actionTargets, useSelection } from './selection'

/**
 * The one delete path (red cube, wrist menu, keyboard, HUD, voice, B/Y while holding).
 * Removes everything in one store update, so a single undo brings it all back, and buzzes
 * both controllers twice so a delete is felt even when it came from voice or a poke.
 * Returns how many objects were removed.
 */
export function deleteObjects(ids: readonly string[]): number {
  const w = useWorld.getState()
  const live = ids.filter((id) => w.objects[id])
  if (!live.length) return 0
  w.removeObjects(live)
  const group = useSelection.getState().ids
  if (group.some((id) => live.includes(id))) useSelection.getState().clear()
  pulseDelete()
  return live.length
}

/** Delete the framed group, or the single selected object. */
export function deleteSelected() {
  deleteObjects(actionTargets())
}
