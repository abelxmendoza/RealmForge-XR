import { useState, useSyncExternalStore } from 'react'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { getConfirmation, subscribeConfirmation, requestConfirmation } from '../world/confirmation'
import type { ConfirmationRequest } from '../voice/types'

const confirm = (request: ConfirmationRequest) => requestConfirmation({
  type: request.action.type === 'DELETE_SELECTED' ? 'DELETE' : 'REPLACE_WORLD',
  message: request.message,
})

export function VoicePanel() {
  const voice = useVoiceCommands({ provider: 'assemblyai', fallbackToMock: false, confirm })
  const confirmation = useSyncExternalStore((notify) => subscribeConfirmation(notify, false), getConfirmation, getConfirmation)
  const [starting, setStarting] = useState(false)
  const [text, setText] = useState('Select wall tool')
  const [submitting, setSubmitting] = useState(false)
  const status = confirmation ? 'Confirmation required' : voice.lastError ? 'Error' : submitting ? 'Processing' : starting ? 'Processing' :
    voice.isListening ? 'Listening' : voice.pendingConfirmation ? 'Confirmation required' :
    voice.lastResult?.status === 'executed' ? 'Command executed' :
    voice.lastCommand ? 'Command recognized' : 'Idle'
  return (
    <aside className="voice-panel" aria-label="Voice commands">
      <strong>Voice commands</strong>
      <p role="status" aria-live="polite">{status}</p>
      <button disabled={starting || submitting} aria-pressed={voice.isListening} onClick={async () => {
        if (voice.isListening) await voice.stopListening()
        else {
          setStarting(true)
          try { await voice.startListening() } finally { setStarting(false) }
        }
      }}>{voice.isListening ? 'Stop listening' : 'Start listening'}</button>
      <button disabled={submitting} onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        void voice.startListening()
      }} onPointerUp={() => void voice.stopListening()} onPointerCancel={() => void voice.stopListening()}>Hold to talk</button>
      <p>{voice.lastPartial || voice.lastTranscript || 'Start, speak a command, then stop.'}</p>
      {voice.lastError && <p role="alert">{voice.lastError}</p>}
      {voice.lastResult && 'message' in voice.lastResult && <p>{voice.lastResult.message}</p>}
      <details>
        <summary>Try a command without a microphone</summary>
        <form onSubmit={async (e) => {
          e.preventDefault()
          setSubmitting(true)
          try { await voice.submitTranscript(text) } finally { setSubmitting(false) }
        }}>
          <label>Command <input value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button disabled={submitting}>Run command</button>
        </form>
      </details>
    </aside>
  )
}
