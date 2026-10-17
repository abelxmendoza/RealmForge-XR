import { useState, useSyncExternalStore } from 'react'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { getConfirmation, subscribeConfirmation } from '../world/confirmation'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'
import { VoiceMicButton } from './VoiceMicButton'

export function VoicePanel() {
  const voice = useVoiceCommands(VOICE_OPTIONS)
  const confirmation = useSyncExternalStore((notify) => subscribeConfirmation(notify, false), getConfirmation, getConfirmation)
  const [starting, setStarting] = useState(false)
  const [text, setText] = useState('Select wall tool')
  const [submitting, setSubmitting] = useState(false)
  const status = confirmation
    ? 'Confirmation required'
    : voice.lastError
      ? 'Error'
      : submitting
        ? 'Processing'
        : starting
          ? 'Processing'
          : voice.isListening
            ? 'Listening'
            : voice.pendingConfirmation
              ? 'Confirmation required'
              : voice.lastResult?.status === 'executed'
                ? 'Command executed'
                : voice.lastCommand
                  ? 'Command recognized'
                  : 'Idle'
  const listening = voice.isListening
  return (
    <>
    <VoiceMicButton />
    <aside className="voice-panel" aria-label="Voice commands">
      <div className="voice-panel-head">
        <span className="voice-panel-title">Voice</span>
        <span className={`voice-status${listening ? ' listening' : ''}`} role="status" aria-live="polite">
          {listening ? <span className="voice-pulse" aria-hidden /> : null}
          {status}
        </span>
      </div>
      <div className="voice-actions">
        <button
          type="button"
          className={listening ? 'primary' : ''}
          disabled={starting || submitting}
          aria-pressed={listening}
          onClick={async () => {
            if (voice.isListening) await voice.stopListening()
            else {
              setStarting(true)
              try {
                await voice.startListening()
              } finally {
                setStarting(false)
              }
            }
          }}
        >
          {listening ? 'Stop listening' : 'Start listening'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            void voice.startListening()
          }}
          onPointerUp={() => void voice.stopListening()}
          onPointerCancel={() => void voice.stopListening()}
        >
          Hold to talk
        </button>
      </div>
      <p>{voice.lastPartial || voice.lastTranscript || 'Start, speak a command, then stop.'}</p>
      {voice.lastError && <p role="alert">{voice.lastError}</p>}
      {voice.lastResult && 'message' in voice.lastResult && <p>{voice.lastResult.message}</p>}
      <details>
        <summary>Try a command without a microphone</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            try {
              await voice.submitTranscript(text)
            } finally {
              setSubmitting(false)
            }
          }}
        >
          <label>
            Command
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={submitting}>
            Run command
          </button>
        </form>
      </details>
    </aside>
    </>
  )
}