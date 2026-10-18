/**
 * AssemblyAI Universal Streaming (v3) client for the browser.
 *
 * Auth: fetches a short-lived token from our Vite/dev proxy (`/api/assemblyai/token`).
 * Never reads ASSEMBLYAI_API_KEY in client code.
 *
 * Audio: uses the device AudioContext rate (laptops often ignore a forced 16 kHz), then
 * resamples to 16 kHz PCM16. ScriptProcessor stays for Quest Browser compatibility.
 */

import type { TranscriptResult } from './types'
import { LinearResampler, float32ToPcm16 } from './pcmResampler'

const WS_BASE = 'wss://streaming.assemblyai.com/v3/ws'
const SAMPLE_RATE = 16_000
/** AssemblyAI wants ~50–1000 ms per binary frame; batch to ~100 ms. */
const CHUNK_SAMPLES = Math.round(SAMPLE_RATE * 0.1)

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

function micErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') {
      return 'Microphone permission denied — click the lock icon in the address bar and allow the microphone'
    }
    if (err.name === 'NotFoundError') {
      return 'No microphone found — plug in a mic or check your system sound settings'
    }
    if (err.name === 'NotReadableError') {
      return 'Microphone is busy — close other apps using the mic, then try again'
    }
    if (err.name === 'SecurityError') {
      return 'Microphone blocked — open the app over HTTPS (or localhost) and allow the mic'
    }
  }
  return err instanceof Error ? err.message : 'Failed to start AssemblyAI session'
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
  let silent: GainNode | null = null
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
      silent?.disconnect()
      processor = null
      source = null
      silent = null
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
      throw new Error('Microphone API unavailable — use Chrome, Edge, or Safari on HTTPS/localhost')
    }
    if (typeof globalThis.isSecureContext === 'boolean' && !globalThis.isSecureContext) {
      throw new Error('Microphone requires HTTPS or localhost')
    }

    // Token first so we never prompt for the mic when the key/proxy is misconfigured.
    const token = await fetchTemporaryToken(tokenUrl, opts.signal)
    opts.signal?.throwIfAborted()

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
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
      const onAbort = () => {
        cleanupOpenListeners()
        reject(new Error('Listening cancelled'))
      }
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

    // Device sample rate (often 44.1/48 kHz on laptops). Do not force 16 kHz — Safari ignores it
    // and Firefox can break echo cancellation when the context rate is overridden.
    audioContext = new AudioContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    const resampler = new LinearResampler(audioContext.sampleRate, SAMPLE_RATE)
    let pending = new Float32Array(0)

    source = audioContext.createMediaStreamSource(stream)
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      if (stopped || !ws || ws.readyState !== WebSocket.OPEN) return
      const input = event.inputBuffer.getChannelData(0)
      const resampled = resampler.process(input)
      if (!resampled.length) return
      const merged = new Float32Array(pending.length + resampled.length)
      merged.set(pending)
      merged.set(resampled, pending.length)
      let offset = 0
      while (merged.length - offset >= CHUNK_SAMPLES) {
        const chunk = merged.subarray(offset, offset + CHUNK_SAMPLES)
        ws.send(float32ToPcm16(chunk))
        offset += CHUNK_SAMPLES
      }
      pending = merged.subarray(offset)
    }
    // Keep the processor in the graph without playing the mic through speakers (laptop feedback).
    silent = audioContext.createGain()
    silent.gain.value = 0
    source.connect(processor)
    processor.connect(silent)
    silent.connect(audioContext.destination)

    opts.onStatus?.('listening')

    return {
      stop: () =>
        (stopping ??= (async () => {
          processor?.disconnect()
          source?.disconnect()
          silent?.disconnect()
          stream?.getTracks().forEach((track) => track.stop())
          if (!stopped && ws?.readyState === WebSocket.OPEN) {
            await new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, 1200)
              finishTurn = () => {
                clearTimeout(timer)
                resolve()
              }
              ws!.send(JSON.stringify({ type: 'ForceEndpoint' }))
            })
            finishTurn = null
          }
          await cleanup()
        })()),
    }
  } catch (err) {
    await cleanup()
    const message = micErrorMessage(err)
    opts.onError(message)
    throw new Error(message)
  }
}
