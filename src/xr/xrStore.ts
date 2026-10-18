import { createXRStore } from '@react-three/xr'
import { useEditor } from '../editor/settings'
import { bindRays } from '../editor/xrInput'
import { UI_RAY_POINTER } from './UILayer'

/**
 * By default no rays in XR: objects are grabbed directly. Hands keep grab + touch pointers;
 * controllers keep grab. Rays can be switched on (HUD, X key, wrist menu).
 * offerSession:false — Enter AR uses enterARWithFallback (depth/plane/anchor chain).
 */
export const xrStore = createXRStore({
  offerSession: false,
  // Rays draw in the on-top UI layer (never hidden by occlusion); see xr/UILayer.tsx.
  hand: { rayPointer: useEditor.getState().rays ? UI_RAY_POINTER : false },
  controller: { rayPointer: useEditor.getState().rays ? UI_RAY_POINTER : false },
})
bindRays(xrStore)
