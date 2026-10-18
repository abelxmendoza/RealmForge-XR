import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAssemblyAISession } from '../assemblyAIClient'

type FakeWs = {
  url: string
  readyState: number
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  addEventListener: (type: string, fn: () => void) => void
  removeEventListener: (type: string, fn: () => void) => void
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: (() => void) | null
  onclose: (() => void) | null
}

describe('AssemblyAI client cleanup', () => {
  const originalMedia = navigator.mediaDevices
  const originalAudioContext = globalThis.AudioContext
  const originalWebSocket = globalThis.WebSocket
  const originalFetch = globalThis.fetch

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: originalMedia,
      configurable: true,
      writable: true,
    })
    globalThis.AudioContext = originalAudioContext
    globalThis.WebSocket = originalWebSocket
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('stops media tracks and closes socket on session.stop()', async () => {
    const trackStop = vi.fn()
    const stream = {
      getTracks: () => [{ stop: trackStop }],
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
      configurable: true,
      writable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token' }),
    }) as typeof fetch

    const wsInstances: FakeWs[] = []

    class FakeWebSocket {
      static OPEN = 1
      readyState = 0
      send = vi.fn()
      close = vi.fn()
      onmessage: ((ev: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      private listeners = new Map<string, Set<() => void>>()

      constructor(public url: string) {
        wsInstances.push(this)
        queueMicrotask(() => {
          this.readyState = FakeWebSocket.OPEN
          for (const fn of this.listeners.get('open') ?? []) fn()
        })
      }

      addEventListener(type: string, fn: () => void) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set())
        this.listeners.get(type)!.add(fn)
      }

      removeEventListener(type: string, fn: () => void) {
        this.listeners.get(type)?.delete(fn)
      }
    }

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

    const disconnect = vi.fn()
    const closeCtx = vi.fn().mockResolvedValue(undefined)
    const processor = {
      connect: vi.fn(),
      disconnect,
      onaudioprocess: null as null | ((ev: unknown) => void),
    }
    const source = {
      connect: vi.fn(),
      disconnect,
    }

    const silent = { connect: vi.fn(), disconnect, gain: { value: 1 } }
    class FakeAudioContext {
      state = 'running'
      sampleRate = 48000
      destination = {}
      createMediaStreamSource = vi.fn().mockReturnValue(source)
      createScriptProcessor = vi.fn().mockReturnValue(processor)
      createGain = vi.fn().mockReturnValue(silent)
      resume = vi.fn()
      close = closeCtx
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext

    const session = await startAssemblyAISession({
      onTranscript: () => {},
      onError: () => {},
    })

    expect(wsInstances[0]?.url).toContain('token=test-token')
    expect(wsInstances[0]?.url).toContain('sample_rate=16000')

    await session.stop()

    expect(trackStop).toHaveBeenCalled()
    expect(closeCtx).toHaveBeenCalled()
    expect(wsInstances[0]?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Terminate' }))
    expect(wsInstances[0]?.close).toHaveBeenCalled()
  })

  it('reports microphone permission errors', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
      configurable: true,
      writable: true,
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 't' }),
    }) as typeof fetch

    const onError = vi.fn()
    await expect(
      startAssemblyAISession({ onTranscript: () => {}, onError }),
    ).rejects.toThrow(/Microphone permission denied/)
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Microphone permission denied/))
  })
})

describe('missing credentials', () => {
  it('reports a missing key without requesting the microphone', async () => {
    const originalFetch = globalThis.fetch
    const originalMedia = navigator.mediaDevices
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'ASSEMBLYAI_API_KEY is not configured' }) })
    try {
      await expect(startAssemblyAISession({ onTranscript: vi.fn(), onError: vi.fn() })).rejects.toThrow(/not configured/)
      expect(getUserMedia).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
      Object.defineProperty(navigator, 'mediaDevices', { value: originalMedia, configurable: true })
    }
  })
})
