import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWebSpeechAvailable, startWebSpeechSession } from '../webSpeechClient'

describe('web speech client', () => {
  type SpeechGlobal = {
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
  const g = globalThis as SpeechGlobal
  const originalSpeech = g.SpeechRecognition
  const originalWebkit = g.webkitSpeechRecognition

  afterEach(() => {
    g.SpeechRecognition = originalSpeech
    g.webkitSpeechRecognition = originalWebkit
    vi.restoreAllMocks()
  })

  it('reports when the API is missing', () => {
    delete g.SpeechRecognition
    delete g.webkitSpeechRecognition
    expect(isWebSpeechAvailable()).toBe(false)
  })

  it('starts recognition and forwards final transcripts', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const handlers: { onresult: ((ev: unknown) => void) | null } = { onresult: null }
    class FakeRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onerror = null
      onend = null
      onresult: ((ev: unknown) => void) | null = null
      start = start
      stop = stop
      abort = vi.fn()
      constructor() {
        Object.defineProperty(this, 'onresult', {
          get: () => handlers.onresult,
          set: (fn: ((ev: unknown) => void) | null) => {
            handlers.onresult = fn
          },
          configurable: true,
        })
      }
    }
    g.SpeechRecognition = FakeRecognition
    expect(isWebSpeechAvailable()).toBe(true)

    const onTranscript = vi.fn()
    const session = startWebSpeechSession({ onTranscript, onError: vi.fn() })
    expect(start).toHaveBeenCalled()

    handlers.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'select wall tool' }, length: 1 }],
    })
    expect(onTranscript).toHaveBeenCalledWith({ text: 'select wall tool', isFinal: true })

    await session.stop()
    expect(stop).toHaveBeenCalled()
  })
})
