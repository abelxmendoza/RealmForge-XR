import { createXRStore } from '@react-three/xr'
import { useEditor } from '../editor/settings'
import { bindRays } from '../editor/xrInput'

/**
 * Shared XR store for the main editor canvas and HUD Enter VR button.
 * Rays default off (grab / poke); HUD, X key, and wrist menu can enable them.
 * offerSession:false — Enter AR uses enterARWithFallback (depth/plane/anchor chain).
 */
export const xrStore = createXRStore({
  offerSession: false,
  hand: { rayPointer: useEditor.getState().rays },
  controller: { rayPointer: useEditor.getState().rays },
})
bindRays(xrStore)
