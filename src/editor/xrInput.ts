import type { XRStore } from '@react-three/xr'
import { useEditor } from './settings'

/**
 * XR pointers follow the editor's `rays` setting. Grab and touch pointers always stay on, so you can
 * still grab and poke things; rays add distant pointing (they drive the same pointer editor as the mouse).
 * The HUD button, the X key and the wrist menu all just flip `useEditor().rays`.
 */
export function bindRays(store: XRStore) {
  const apply = (on: boolean) => {
    store.setHand({ rayPointer: on })
    store.setController({ rayPointer: on })
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
