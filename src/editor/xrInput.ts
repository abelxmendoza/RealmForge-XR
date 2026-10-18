import type { XRStore } from '@react-three/xr'
import { useEditor } from './settings'
import { usePlacement } from '../xr/placement'
import { UI_RAY_POINTER } from '../xr/UILayer'

/**
 * XR pointers follow the editor's `rays` setting. Grab and touch pointers always stay on, so you can
 * still grab and poke things; rays add distant pointing (they drive the same pointer editor as the mouse).
 * The HUD button, the X key and the wrist menu all just flip `useEditor().rays`.
 */
export function bindRays(store: XRStore) {
  const apply = (on: boolean) => {
    // Rays draw in the on-top UI layer, so occlusion never hides the ray you aim at a menu with.
    store.setHand({ rayPointer: on ? UI_RAY_POINTER : false })
    store.setController({ rayPointer: on ? UI_RAY_POINTER : false })
  }
  apply(useEditor.getState().rays)
  let pending: ReturnType<typeof setTimeout> | null = null
  return useEditor.subscribe((s, prev) => {
    if (s.rays === prev.rays) return
    // Swapping pointers remounts the hand/controller pointer components. Do it after the current frame
    // and pointer dispatch (the toggle usually comes from a wrist-menu press, mid-frame, with a pointer down).
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => {
      pending = null
      try {
        apply(useEditor.getState().rays)
      } catch (err) {
        console.error('Toggling XR rays failed', err)
      }
    }, 50)
  })
}

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
