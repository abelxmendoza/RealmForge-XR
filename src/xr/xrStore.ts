import { useSyncExternalStore } from 'react'
import { createXRStore } from '@react-three/xr'
import { UI_RAY_POINTER } from './UILayer'

/**
 * Rays always exist so every menu (palette, guide) can be pointed at from a distance; whether they also
 * reach the world is the Rays setting (HUD, X key, wrist menu): see `worldPointerTypes` in editor/xrInput.ts.
 * Objects are still grabbed and poked directly. offerSession:false — Enter AR uses enterARWithFallback.
 */
export const xrStore = createXRStore({
  offerSession: false,
  // Controller / hand models ship with the app (public/xr-profiles) instead of a CDN, so a flaky
  // network never stops the controllers from appearing. Unknown controllers fall back to Touch Plus.
  baseAssetPath: new URL('xr-profiles/', new URL(import.meta.env.BASE_URL, window.location.href)).href,
  defaultControllerProfileId: 'meta-quest-touch-plus',
  // Rays draw in the on-top UI layer (never hidden by occlusion); see xr/UILayer.tsx.
  hand: { rayPointer: UI_RAY_POINTER },
  controller: { rayPointer: UI_RAY_POINTER },
})

const subscribeSession = (onChange: () => void) => xrStore.subscribe(onChange)
const hasSession = () => xrStore.getState().session != null

/**
 * Whether an immersive session is running, for DOM components outside the canvas. Desktop modals check it:
 * a modal <dialog> makes the page inert, which also swallows every XR press, so none may open during XR.
 */
export const useInXRSession = () => useSyncExternalStore(subscribeSession, hasSession, hasSession)
