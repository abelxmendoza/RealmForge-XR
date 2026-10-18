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
  const [typedOpen, setTypedOpen] = useState(true)
  const engine =
    voice.provider === 'webspeech' ? 'Device mic' : voice.provider === 'assemblyai' ? 'Cloud mic' : 'Typed'
  const status = confirmation
    ? 'Confirmation required'
    : voice.lastError && !voice.isListening
      ? 'Error'
      : submitting
        ? 'Processing'
        : starting
          ? 'Starting mic…'
          : voice.isListening
            ? `Listening (${engine})`
            : voice.pendingConfirmation
              ? 'Confirmation required'
              : voice.lastResult?.status === 'executed'
                ? 'Command executed'
                : voice.lastCommand
                  ? 'Command recognized'
                  : 'Idle'
  const listening = voice.isListening
  const heard = voice.lastPartial || voice.lastTranscript
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
            title={listening ? 'Stop the microphone' : 'Start the microphone (Chrome, Edge, or Safari recommended)'}
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
            title="Hold to talk, release to run the command"
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
        <p className="voice-transcript" title="Select and copy this text">
          {heard || 'Start listening, speak a command, then stop — or type one below.'}
        </p>
        {voice.lastError && (
          <p role="alert" className="voice-error">
            {voice.lastError}
          </p>
        )}
        {voice.lastResult && 'message' in voice.lastResult && <p className="voice-result">{voice.lastResult.message}</p>}
        <details open={typedOpen} onToggle={(e) => setTypedOpen(e.currentTarget.open)}>
          <summary>Type a command (works without a mic)</summary>
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
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='e.g. "Select wall tool"'
                autoComplete="off"
              />
            </label>
            <button type="submit" className="primary" disabled={submitting || !text.trim()}>
              Run command
            </button>
          </form>
        </details>
      </aside>
    </>
  )
}