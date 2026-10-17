import type { WebXRManager } from 'three'
import { create } from 'zustand'

/**
 * Session feature attempts mirrored from `xr-test/main.js`.
 * Depth-sensing is tried first (Quest 3S) but must fall back — a bad depth config
 * can reject the whole `requestSession` even when listed as optional.
 */
const FULL_FEATURES = [
  'local-floor',
  'anchors',
  'plane-detection',
  'mesh-detection',
  'hand-tracking',
  'hit-test',
] as const

export type ARAttempt = {
  name: string
  init: XRSessionInit
}

export const AR_ATTEMPTS: ARAttempt[] = [
  {
    name: 'full (with depth)',
    init: {
      optionalFeatures: [...FULL_FEATURES, 'depth-sensing'],
      depthSensing: {
        usagePreference: ['gpu-optimized', 'cpu-optimized'],
        dataFormatPreference: ['luminance-alpha', 'float32'],
      },
    },
  },
  { name: 'no depth', init: { optionalFeatures: [...FULL_FEATURES] } },
  { name: 'minimal', init: { optionalFeatures: ['local-floor'] } },
]

export interface XRSessionMeta {
  attempt: string | null
  features: string[]
  blend: string | null
  lastError: string | null
  entering: boolean
  setEntering: (v: boolean) => void
  setStarted: (info: { attempt: string; features: string[]; blend: string }) => void
  setError: (message: string) => void
  clear: () => void
}

export const useXRSessionMeta = create<XRSessionMeta>((set) => ({
  attempt: null,
  features: [],
  blend: null,
  lastError: null,
  entering: false,
  setEntering: (entering) => set({ entering }),
  setStarted: ({ attempt, features, blend }) =>
    set({ attempt, features, blend, lastError: null, entering: false }),
  setError: (lastError) => set({ lastError, entering: false }),
  clear: () => set({ attempt: null, features: [], blend: null, lastError: null, entering: false }),
}))

/** Bound from the R3F canvas so HUD buttons (outside Canvas) can call setSession. */
let webXrManager: WebXRManager | null = null

export function bindWebXRManager(manager: WebXRManager | null) {
  webXrManager = manager
}

export function getWebXRManager() {
  return webXrManager
}

export type EnterARResult =
  | { ok: true; session: XRSession; attempt: string }
  | { ok: false; errors: string[] }

/**
 * Request immersive-ar with Emiliano's fallback chain, then attach the session
 * to Three's WebXRManager so `@react-three/xr`'s store binds via `sessionstart`.
 */
export async function enterARWithFallback(): Promise<EnterARResult> {
  const meta = useXRSessionMeta.getState()
  meta.setEntering(true)

  if (typeof navigator === 'undefined' || navigator.xr == null) {
    const msg = 'WebXR not available — open in the Quest Browser (https or localhost).'
    meta.setError(msg)
    return { ok: false, errors: [msg] }
  }

  const manager = webXrManager
  if (manager == null) {
    const msg = 'XR manager not ready — wait for the canvas to load, then try again.'
    meta.setError(msg)
    return { ok: false, errors: [msg] }
  }

  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)
  if (!supported) {
    const msg = 'immersive-ar not supported on this browser/device.'
    meta.setError(msg)
    return { ok: false, errors: [msg] }
  }

  const errors: string[] = []
  for (const a of AR_ATTEMPTS) {
    try {
      const session = await navigator.xr.requestSession('immersive-ar', a.init)
      const features = [...((session as XRSession & { enabledFeatures?: string[] }).enabledFeatures ?? [])]
      const blend = session.environmentBlendMode ?? '?'
      await manager.setSession(session)
      meta.setStarted({ attempt: a.name, features, blend })
      console.log('[RealmForge] AR session started:', { attempt: a.name, features, blend, priorErrors: errors })
      return { ok: true, session, attempt: a.name }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      errors.push(`${a.name}: ${err.name} ${err.message}`)
    }
  }

  const joined = errors.join('\n')
  meta.setError(joined)
  console.warn('[RealmForge] Could not start AR:\n' + joined)
  return { ok: false, errors }
}
