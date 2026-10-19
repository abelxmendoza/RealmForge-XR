import type { WebXRManager } from 'three'
import { create } from 'zustand'

/**
 * Session feature attempts mirrored from `xr-test/main.js`.
 * Depth-sensing is tried first (Quest 3S) but must fall back — a bad depth config
 * can reject the whole `requestSession` even when listed as optional.
 */
const FULL_FEATURES = [
  'local-floor',
  // Lets you walk past the play-area boundary in passthrough (Quest Browser); used as the reference space when granted.
  'unbounded',
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
  /** Reference space in use: 'unbounded' (walk anywhere) or 'local-floor'. */
  referenceSpace: string | null
  /** Session visibility: 'visible', or 'visible-blurred' / 'hidden' while the system pauses it (boundary, menu). */
  visibility: string | null
  lastError: string | null
  entering: boolean
  setEntering: (v: boolean) => void
  setStarted: (info: { attempt: string; features: string[]; blend: string; referenceSpace: string }) => void
  setVisibility: (v: string) => void
  setError: (message: string) => void
  clear: () => void
}

export const useXRSessionMeta = create<XRSessionMeta>((set) => ({
  attempt: null,
  features: [],
  blend: null,
  referenceSpace: null,
  visibility: null,
  lastError: null,
  entering: false,
  setEntering: (entering) => set({ entering }),
  setStarted: ({ attempt, features, blend, referenceSpace }) =>
    set({ attempt, features, blend, referenceSpace, visibility: 'visible', lastError: null, entering: false }),
  setVisibility: (visibility) => set({ visibility }),
  setError: (lastError) => set({ lastError, entering: false }),
  clear: () => set({ attempt: null, features: [], blend: null, referenceSpace: null, visibility: null, lastError: null, entering: false }),
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
      // Unbounded tracking lets you walk beyond the boundary; placement is head-relative, so the origin doesn't matter.
      const referenceSpace: XRReferenceSpaceType = features.includes('unbounded') ? 'unbounded' : 'local-floor'
      // (Only before presenting: three.js can't switch it mid-session, e.g. if Enter AR is pressed twice.)
      if (!manager.isPresenting) manager.setReferenceSpaceType(referenceSpace)
      // A system pause (walking out of bounds, the Quest menu) blurs or hides the session; keep state and say so.
      session.addEventListener('visibilitychange', () => {
        useXRSessionMeta.getState().setVisibility(session.visibilityState)
        if (session.visibilityState !== 'visible') console.warn('[RealmForge] XR session paused by the system:', session.visibilityState)
      })
      await manager.setSession(session)
      meta.setStarted({ attempt: a.name, features, blend, referenceSpace })
      console.log('[RealmForge] AR session started:', { attempt: a.name, features, blend, referenceSpace, priorErrors: errors })
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

/**
 * Leave the headset view and return to the desktop editor (palette "Exit VR", wrist "Exit", "exit VR").
 * Returns false when no session is running. A session that refuses to end is reported, never thrown.
 */
export async function exitXR(): Promise<boolean> {
  const session = webXrManager?.getSession()
  if (!session) return false
  try {
    await session.end()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    useXRSessionMeta.getState().setError(`Couldn't exit XR: ${message}`)
    console.error('[RealmForge] Exit XR failed', error)
    return false
  }
}

/**
 * The HUD's VR button: enter immersive-vr through the XR store, reporting a refusal (no headset, the
 * browser blocked it, the session failed to start) in the HUD instead of an unhandled promise rejection.
 */
export async function enterVRSafely(enter: () => Promise<unknown>): Promise<boolean> {
  const meta = useXRSessionMeta.getState()
  if (typeof navigator === 'undefined' || navigator.xr == null) {
    meta.setError('WebXR not available — open in the Quest Browser (https or localhost).')
    return false
  }
  meta.setEntering(true)
  try {
    await enter()
    meta.setEntering(false)
    return true
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    meta.setError(`Couldn't enter VR — ${message}`)
    console.error('[RealmForge] Enter VR failed', error)
    return false
  }
}

/** Which immersive modes this browser offers. `checked` stays false until detection finishes. */
export interface XRSupport {
  ar: boolean
  vr: boolean
  checked: boolean
}

export const useXRSupport = create<XRSupport>(() => ({ ar: false, vr: false, checked: false }))

let supportCheck: Promise<XRSupport> | null = null

/** Ask the browser once whether immersive AR / VR are available (phones and most desktops say no). */
export function detectXRSupport(): Promise<XRSupport> {
  if (supportCheck) return supportCheck
  const xr = typeof navigator === 'undefined' ? undefined : navigator.xr
  const ask = (mode: XRSessionMode) => (xr ? xr.isSessionSupported(mode).catch(() => false) : Promise.resolve(false))
  supportCheck = Promise.all([ask('immersive-ar'), ask('immersive-vr')]).then(([ar, vr]) => {
    const support = { ar, vr, checked: true }
    useXRSupport.setState(support)
    return support
  })
  return supportCheck
}
