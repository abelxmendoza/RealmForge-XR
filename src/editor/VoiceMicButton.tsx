import { useEffect, useRef, useState } from 'react'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'

/**
 * Big floating microphone button for the web app.
 * Tap to start, tap again to stop and run the command. Or hold Space to talk.
 * Uses the same shared voice controller as the Voice panel and the VR palette.
 */
export function VoiceMicButton() {
  const voice = useVoiceCommands(VOICE_OPTIONS)
  const [busy, setBusy] = useState(false)
  const holding = useRef(false)

  const start = async () => {
    if (voice.isListening || busy) return
    setBusy(true)
    try {
      await voice.startListening()
    } finally {
      setBusy(false)
    }
  }
  const stop = () => voice.stopListening()
  const toggle = () => (voice.isListening ? void stop() : void start())

  // Hold Space to talk (ignored while typing in a field).
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
    const down = (e: KeyboardEvent) => {
      // Don't steal Space while typing, or when modifiers are held (copy / shortcuts).
      if (e.code !== 'Space' || e.repeat || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      holding.current = true
      void voice.controller.startListening()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !holding.current) return
      holding.current = false
      void voice.controller.stopListening()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [voice.controller])

  const heard = voice.lastPartial || voice.lastTranscript
  const label = busy
    ? 'Starting mic…'
    : voice.isListening
      ? voice.provider === 'webspeech'
        ? 'Listening… tap to stop'
        : 'Listening… tap to stop'
      : 'Voice command'
  return (
    <div className="voice-mic">
      <button
        className={voice.isListening ? 'mic listening' : 'mic'}
        aria-pressed={voice.isListening}
        aria-label={voice.isListening ? 'Stop listening' : 'Start a voice command'}
        title="Tap to talk, tap again to run. Or hold Space. Works with your laptop microphone in Chrome, Edge, or Safari."
        disabled={busy}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
          />
        </svg>
        <span>{label}</span>
      </button>
      {(heard || voice.lastError) && (
        <p className={voice.lastError && !heard ? 'heard error' : 'heard'} title="Select and copy this text">
          {heard ? `“${heard}”` : voice.lastError}
        </p>
      )}
      {!voice.isListening && !heard && !voice.lastError && <p className="heard hint">Hold Space to talk · or type in the Voice panel</p>}
    </div>
  )
}
