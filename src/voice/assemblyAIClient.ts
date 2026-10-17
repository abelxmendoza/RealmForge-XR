/**
 * AssemblyAI Universal Streaming (v3) client for the browser.
 *
 * Auth: fetches a short-lived token from our Vite/dev proxy (`/api/assemblyai/token`).
 * Never reads ASSEMBLYAI_API_KEY in client code.
 *
 * Docs: https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token
 */

import type { TranscriptResult } from './types'

const WS_BASE = 'wss://streaming.assemblyai.com/v3/ws'
const SAMPLE_RATE = 16_000

export type AssemblyAIClientOptions = {
  /** Override token endpoint (default `/api/assemblyai/token`). */
  signal?: AbortSignal
  tokenUrl?: string
  onTranscript: (result: TranscriptResult) => void
  onError: (message: string) => void
  onStatus?: (status: 'connecting' | 'listening' | 'stopped') => void
}

export type AssemblyAISession = {
  stop: () => Promise<void>
}

type TokenResponse = { token?: string; error?: string }

async function fetchTemporaryToken(tokenUrl: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(tokenUrl, { method: 'GET', signal })
  let data: TokenResponse
  try {
    data = (await res.json()) as TokenResponse
  } catch {
    throw new Error(`Token endpoint returned non-JSON (${res.status})`)
  }
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Failed to obtain AssemblyAI token (${res.status})`)
  }
  return data.token
}

/**
 * Start microphone capture + AssemblyAI streaming transcription.
 * Caller must invoke `session.stop()` to release mic + socket.
 */
export async function startAssemblyAISession(
  opts: AssemblyAIClientOptions,
): Promise<AssemblyAISession> {
  const tokenUrl = opts.tokenUrl ?? '/api/assemblyai/token'
  opts.onStatus?.('connecting')

  let stream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let ws: WebSocket | null = null
  let stopped = false
  let finishTurn: (() => void) | null = null
  let stopping: Promise<void> | null = null

  const cleanup = async () => {
    if (stopped) return
    stopped = true

    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'Terminate' }))
      }
    } catch {
      /* ignore */
    }

    try {
      processor?.disconnect()
      source?.disconnect()
      processor = null
      source = null
    } catch {
      /* ignore */
    }

    if (audioContext) {
      try {
        await audioContext.close()
      } catch {
        /* ignore */
      }
      audioContext = null
    }

    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }

    if (ws) {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      ws = null
    }

    opts.onStatus?.('stopped')
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API unavailable in this browser')
    }

    const token = await fetchTemporaryToken(tokenUrl, opts.signal)
    opts.signal?.throwIfAborted()

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    })

    if (opts.signal?.aborted) {
      stream.getTracks().forEach((track) => track.stop())
      opts.signal.throwIfAborted()
    }

    const params = new URLSearchParams({
      sample_rate: String(SAMPLE_RATE),
      speech_model: 'universal-3-6-pro',
      token,
    })
    const endpoint = `${WS_BASE}?${params.toString()}`
    ws = new WebSocket(endpoint)

    await new Promise<void>((resolve, reject) => {
      if (!ws) return reject(new Error('WebSocket missing'))
      const onOpen = () => {
        cleanupOpenListeners()
        resolve()
      }
      const onAbort = () => { cleanupOpenListeners(); reject(new Error('Listening cancelled')) }
      const onError = () => {
        cleanupOpenListeners()
        reject(new Error('AssemblyAI WebSocket connection failed'))
      }
      const cleanupOpenListeners = () => {
        ws?.removeEventListener('open', onOpen)
        ws?.removeEventListener('error', onError)
        ws?.removeEventListener('close', onError)
        opts.signal?.removeEventListener('abort', onAbort)
      }
      ws.addEventListener('open', onOpen)
      ws.addEventListener('error', onError)
      ws.addEventListener('close', onError)
      opts.signal?.addEventListener('abort', onAbort, { once: true })
    })

    const completedTurns = new Set<number>()
    ws.onmessage = (ev) => {
      if (stopped) return
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string
          transcript?: string
          end_of_turn?: boolean
          turn_is_formatted?: boolean
          turn_order?: number
        }
        if (msg.type === 'Turn' && typeof msg.transcript === 'string' && msg.transcript.trim()) {
          const isFinal = Boolean(msg.end_of_turn)
          if (isFinal && msg.turn_order !== undefined) {
            if (completedTurns.has(msg.turn_order)) return
            completedTurns.add(msg.turn_order)
          }
          opts.onTranscript({ text: msg.transcript.trim(), isFinal })
          if (isFinal) finishTurn?.()
        }
      } catch {
        /* ignore malformed frames */
      }
    }

    ws.onerror = () => {
      if (!stopped) opts.onError('AssemblyAI connection error')
    }

    ws.onclose = () => {
      if (!stopped) {
        opts.onError('AssemblyAI connection closed')
        void cleanup()
      }
    }

    // Audio pipeline: mic → AudioContext @ 16k → PCM16 → WebSocket binary frames
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    source = audioContext.createMediaStreamSource(stream)
    // ScriptProcessor is deprecated but widely available in Quest browser; keep buffer modest.
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      if (stopped || !ws || ws.readyState !== WebSocket.OPEN) return
      const input = event.inputBuffer.getChannelData(0)
      const pcm = floatTo16BitPCM(input)
      ws.send(pcm)
    }
    source.connect(processor)
    processor.connect(audioContext.destination)

    opts.onStatus?.('listening')

    return {
      stop: () => stopping ??= (async () => {
        // Release microphone immediately, then drain the final turn before terminating.
        processor?.disconnect()
        source?.disconnect()
        stream?.getTracks().forEach((track) => track.stop())
        if (!stopped && ws?.readyState === WebSocket.OPEN) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1200)
            finishTurn = () => { clearTimeout(timer); resolve() }
            ws!.send(JSON.stringify({ type: 'ForceEndpoint' }))
          })
          finishTurn = null
        }
        await cleanup()
      })(),
    }
  } catch (err) {
    await cleanup()
    const message =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : err instanceof Error
          ? err.message
          : 'Failed to start AssemblyAI session'
    opts.onError(message)
    throw new Error(message)
  }
}

function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]!))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}
