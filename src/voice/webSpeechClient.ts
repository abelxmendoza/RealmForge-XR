/**
 * Browser Speech Recognition (Chrome / Edge / Safari) — works on laptops without an AssemblyAI key.
 * Quest Browser often lacks this API; AssemblyAI remains the XR path.
 */

import type { TranscriptResult } from './types'

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: BrowserSpeechResultEvent) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

type BrowserSpeechResultEvent = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } } & { length: number }>
}

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }

export type WebSpeechSession = {
  stop: () => Promise<void>
}

export function isWebSpeechAvailable(): boolean {
  if (typeof globalThis === 'undefined') return false
  const w = globalThis as SpeechWindow
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function startWebSpeechSession(opts: {
  onTranscript: (result: TranscriptResult) => void
  onError: (message: string) => void
  onStatus?: (status: 'connecting' | 'listening' | 'stopped') => void
  lang?: string
}): WebSpeechSession {
  const w = globalThis as SpeechWindow
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) {
    const message = 'Browser speech recognition is not available in this browser'
    opts.onError(message)
    throw new Error(message)
  }

  opts.onStatus?.('connecting')
  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = opts.lang ?? 'en-US'

  let stopped = false
  let stopping: Promise<void> | null = null

  recognition.onresult = (ev) => {
    if (stopped) return
    let interim = ''
    let finalText = ''
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i]
      if (!result || !result[0]) continue
      const piece = result[0].transcript.trim()
      if (!piece) continue
      if (result.isFinal) finalText = finalText ? `${finalText} ${piece}` : piece
      else interim = interim ? `${interim} ${piece}` : piece
    }
    if (interim) opts.onTranscript({ text: interim, isFinal: false })
    if (finalText) opts.onTranscript({ text: finalText, isFinal: true })
  }

  recognition.onerror = (ev) => {
    if (stopped) return
    if (ev.error === 'aborted' || ev.error === 'no-speech') return
    const message =
      ev.error === 'not-allowed'
        ? 'Microphone permission denied — allow the mic in your browser settings, then try again'
        : ev.error === 'audio-capture'
          ? 'No microphone found — plug in a mic or check system sound settings'
          : ev.error === 'network'
            ? 'Speech recognition needs a network connection'
            : `Speech recognition error: ${ev.error}`
    opts.onError(message)
  }

  recognition.onend = () => {
    if (stopped) {
      opts.onStatus?.('stopped')
      return
    }
    // Chrome ends after a pause; keep listening until the user stops.
    try {
      recognition.start()
    } catch {
      stopped = true
      opts.onStatus?.('stopped')
    }
  }

  try {
    recognition.start()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start browser speech recognition'
    opts.onError(message)
    throw new Error(message)
  }

  opts.onStatus?.('listening')

  return {
    stop: () =>
      (stopping ??= (async () => {
        if (stopped) return
        stopped = true
        try {
          recognition.onend = () => opts.onStatus?.('stopped')
          recognition.stop()
        } catch {
          opts.onStatus?.('stopped')
        }
      })()),
  }
}
