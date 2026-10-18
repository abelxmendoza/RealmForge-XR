import { createXRStore } from '@react-three/xr'
import { useEditor } from '../editor/settings'
import { bindRays } from '../editor/xrInput'

/**
 * By default no rays in XR: objects are grabbed directly. Hands keep grab + touch pointers;
 * controllers keep grab. Rays can be switched on (HUD, X key, wrist menu).
 * offerSession:false — Enter AR uses enterARWithFallback (depth/plane/anchor chain).
 */
export const xrStore = createXRStore({
  offerSession: false,
  hand: { rayPointer: useEditor.getState().rays },
  controller: { rayPointer: useEditor.getState().rays },
})
bindRays(xrStore)
