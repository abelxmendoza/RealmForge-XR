import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'
import { getConfirmation, subscribeConfirmation } from '../world/confirmation'

/**
 * The one voice control in the web app: a microphone button at the bottom of the screen.
 * Tap it and speak; the command runs when you pause (tap again to run it right away).
 * Hold Space to talk instead. "Type" runs a command without a microphone.
 * Shares one AssemblyAI controller with the VR control palette's voice tile.
 */
export function VoicePanel() {
  const voice = useVoiceCommands(VOICE_OPTIONS)
  const confirmation = useSyncExternalStore((notify) => subscribeConfirmation(notify, false), getConfirmation, getConfirmation)
  const [starting, setStarting] = useState(false)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const holding = useRef(false)

  const start = async () => {
    if (voice.isListening || starting) return
    setStarting(true)
    try {
      await voice.startListening()
    } finally {
      setStarting(false)
    }
  }
  const toggle = () => (voice.isListening ? void voice.stopListening() : void start())

  // Hold Space to talk (ignored while typing in a field).
  useEffect(() => {
    const inField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || inField(e.target)) return
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

  const heard = voice.isListening ? voice.lastPartial : voice.lastTranscript
  const result = voice.lastResult && 'message' in voice.lastResult ? voice.lastResult.message : null
  const ok = voice.lastResult?.status === 'executed'
  const label = starting ? 'Starting mic…' : voice.isListening ? 'Listening… pause to run' : confirmation ? 'Confirm on screen' : 'Voice command'
  const line = voice.lastError
    ? voice.lastError
    : voice.isListening
      ? heard
        ? `“${heard}”`
        : 'Speak now, e.g. “add three trees near the robot”'
      : result
        ? `${heard ? `“${heard}” · ` : ''}${result}`
        : 'Tap and speak, or hold Space'

  return (
    <div className="voice-mic" aria-label="Voice commands">
      <div className="voice-row">
        <button
          className={voice.isListening ? 'mic listening' : 'mic'}
          aria-pressed={voice.isListening}
          aria-label={voice.isListening ? 'Run the command now' : 'Start a voice command'}
          disabled={starting}
          onClick={toggle}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
          </svg>
          <span>{label}</span>
        </button>
        <button className="voice-type" aria-expanded={typing} title="Type a command instead" onClick={() => setTyping(!typing)}>
          Type
        </button>
      </div>
      {typing && (
        <form
          className="voice-typed"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!text.trim()) return
            await voice.submitTranscript(text)
            setText('')
          }}
        >
          <input autoFocus value={text} placeholder="add three trees near the robot" onChange={(e) => setText(e.target.value)} />
          <button type="submit">Run</button>
        </form>
      )}
      <p className={voice.lastError ? 'heard error' : ok ? 'heard ok' : 'heard'} role="status" aria-live="polite">
        {line}
      </p>
    </div>
  )
}
