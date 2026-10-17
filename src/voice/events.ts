import type { VoiceEvent, VoiceEventListener } from './types'

const listeners = new Set<VoiceEventListener>()

/** Subscribe to voice lifecycle events (for ElevenLabs Agent 3, UI, XR HUD). */
export function subscribeVoiceEvents(listener: VoiceEventListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitVoiceEvent(event: VoiceEvent): void {
  for (const l of listeners) {
    try {
      l(event)
    } catch (err) {
      console.warn('[voice] event listener error', err)
    }
  }
}
