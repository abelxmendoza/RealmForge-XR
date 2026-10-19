import { useEditor } from './settings'
import { usePlacement } from '../xr/placement'

/**
 * What XR pointers may do in the world (the map root in Scene.tsx). Rays always reach the menus; with the
 * Rays setting off they skip the world, so you edit by grabbing and poking but can still point at a panel
 * from across the room. Grab and touch pointers always reach the world.
 */
export const worldPointerTypes = (rays: boolean) => (rays ? 'all' : ({ deny: 'ray' } as const))

export const toggleRays = () => useEditor.getState().set({ rays: !useEditor.getState().rays })

/** Switch between the real surface (transparent grid over your floor/table) and the virtual placeholder ground. */
export const toggleSurface = () => useEditor.getState().set({ surface: useEditor.getState().surface === 'real' ? 'virtual' : 'real' })

/**
 * "Place city" from the wrist menu: start main's plane picker (xr/WorldPlacement). Picking a floor plane
 * needs a ray (it's out of fingertip reach), so rays come on while choosing and go back to how they were
 * once the world is pinned or choosing is cancelled. Pressing again while choosing cancels.
 */
export function togglePlaceCity() {
  const p = usePlacement.getState()
  if (p.status === 'choosing') {
    p.cancelChoosing()
    return
  }
  const hadRays = useEditor.getState().rays
  if (!hadRays) useEditor.getState().set({ rays: true })
  p.startChoosing()
  const unsubscribe = usePlacement.subscribe((s) => {
    if (s.status === 'choosing') return
    unsubscribe()
    if (!hadRays) useEditor.getState().set({ rays: false })
  })
}
