import { useEditor } from '../editor/settings'
import { endDrag } from '../editor/drag'
import { usePlacement } from './placement'
import { startMeasuring } from '../scan/store'
import { useWorld } from '../world/store'
import { placement, type ScaleId } from '../scene/worldRoot'

/** Presentation only: the same world, selection and history remain editable at every scale. */
export function switchWorldView(view: ScaleId) {
  endDrag()
  // A measurement started at another presentation scale must not keep stale ray picks.
  startMeasuring(false)
  if (view !== 'tabletop') usePlacement.getState().resetToDefault()
  const world = useWorld.getState()
  const selected = world.selectedId ? world.objects[world.selectedId] : undefined
  // Enter near the selection, otherwise near the robot start. Never move scene objects.
  placement.focus = view === 'life' && selected ? [selected.position[0], selected.position[2]] : null
  placement.pending = true
  useEditor.getState().set({ worldScale: view })
}

export function toggleWorldView() {
  switchWorldView(useEditor.getState().worldScale === 'life' ? 'tabletop' : 'life')
}
