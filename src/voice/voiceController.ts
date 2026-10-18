/**
 * Push-to-talk voice controller.
 * Separates STT (AssemblyAI or mock) from parse → execute.
 */

import { startAssemblyAISession, type AssemblyAISession } from './assemblyAIClient'
import { parseVoiceCommand } from './commandParser'
import { executeVoiceCommand, type CommandExecutorOptions, type ExecuteResult } from './commandExecutor'
import { emitVoiceEvent } from './events'
import { addMockTranscriptHandler } from './mockProvider'
import { isWebSpeechAvailable, startWebSpeechSession, type WebSpeechSession } from './webSpeechClient'
import type { ConfirmHandler, TranscriptResult, VoiceCommand } from './types'

export type VoiceProviderMode = 'assemblyai' | 'webspeech' | 'mock'

export type VoiceControllerState = {
  enabled: boolean
  isListening: boolean
  lastTranscript: string | null
  lastPartial: string | null
  lastCommand: VoiceCommand | null
  lastResult: ExecuteResult | null
  lastError: string | null
  provider: VoiceProviderMode
  pendingConfirmation: ExecuteResult | null
}

export type VoiceControllerOptions = {
  /** Default: assemblyai when available; mock always works for submitMockTranscript. */
  registerMock?: boolean
  provider?: VoiceProviderMode
  confirm?: ConfirmHandler
  tokenUrl?: string
  /** Prefer mock when AssemblyAI token/mic fails (default true). */
  fallbackToMock?: boolean
  /**
   * Prefer browser SpeechRecognition when AssemblyAI fails (default true).
   * Works on Chrome / Edge / Safari laptops without an AssemblyAI key.
   */
  fallbackToWebSpeech?: boolean
}

type Listener = (state: VoiceControllerState) => void

export class VoiceController {
  private cachedState: VoiceControllerState | null = null
  private starting: Promise<void> | null = null
  private generation = 0
  private abortStart: AbortController | null = null
  private enabled = true
  private isListening = false
  private lastTranscript: string | null = null
  private lastPartial: string | null = null
  private lastCommand: VoiceCommand | null = null
  private lastResult: ExecuteResult | null = null
  private lastError: string | null = null
  private provider: VoiceProviderMode
  private pendingConfirmation: ExecuteResult | null = null
  private session: AssemblyAISession | WebSpeechSession | null = null
  private confirm: ConfirmHandler | undefined
  private tokenUrl: string | undefined
  private fallbackToMock: boolean
  private fallbackToWebSpeech: boolean
  private listeners = new Set<Listener>()
  /** Deduplicate identical final transcripts within a short window. */
  private lastFinalKey: string | null = null
  private lastFinalAt = 0
  private processing = false
  private removeMockHandler: (() => void) | null = null

  constructor(opts: VoiceControllerOptions = {}) {
    this.provider = opts.provider ?? 'mock'
    this.confirm = opts.confirm
    this.tokenUrl = opts.tokenUrl
    this.fallbackToMock = opts.fallbackToMock ?? true
    this.fallbackToWebSpeech = opts.fallbackToWebSpeech ?? true
    if (opts.registerMock !== false) this.connectMock()
  }

  connectMock(): void {
    if (this.removeMockHandler) return
    this.removeMockHandler = addMockTranscriptHandler((r) => {
      void this.handleTranscript(r)
    })
  }

  getState(): VoiceControllerState {
    return this.cachedState ??= {
      enabled: this.enabled,
      isListening: this.isListening,
      lastTranscript: this.lastTranscript,
      lastPartial: this.lastPartial,
      lastCommand: this.lastCommand,
      lastResult: this.lastResult,
      lastError: this.lastError,
      provider: this.provider,
      pendingConfirmation: this.pendingConfirmation,
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    this.cachedState = null
    const state = this.getState()
    for (const l of this.listeners) l(state)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) void this.stopListening()
    this.emit()
  }

  setConfirmHandler(confirm: ConfirmHandler | undefined): void {
    this.confirm = confirm
  }

  setProvider(provider: VoiceProviderMode): void {
    this.provider = provider
    this.emit()
  }

  /**
   * Push-to-talk: start mic + STT (AssemblyAI) or arm mock input.
   */
  startListening(): Promise<void> {
    if (this.starting) return this.starting
    this.starting = this.startSession().finally(() => { this.starting = null })
    return this.starting
  }

  private async startSession(): Promise<void> {
    const generation = ++this.generation
    this.abortStart = new AbortController()
    if (!this.enabled) {
      this.lastError = 'Voice recognition is disabled'
      this.emit()
      return
    }
    if (this.isListening) return

    this.lastError = null
    this.pendingConfirmation = null

    if (this.provider === 'mock') {
      this.isListening = true
      this.emit()
      return
    }

    if (this.provider === 'webspeech') {
      await this.startWebSpeech(generation)
      return
    }

    try {
      const session = await startAssemblyAISession({
        tokenUrl: this.tokenUrl,
        signal: this.abortStart.signal,
        onTranscript: (r) => {
          if (generation === this.generation) void this.handleTranscript(r)
        },
        onError: (message) => {
          this.lastError = message
          this.emit()
        },
        onStatus: (status) => {
          if (generation !== this.generation) return
          if (status === 'listening') {
            this.isListening = true
            this.emit()
          }
          if (status === 'stopped') {
            this.isListening = false
            this.session = null
            this.emit()
          }
        },
      })
      if (generation !== this.generation || !this.enabled) {
        await session.stop()
        return
      }
      this.session = session
      this.provider = 'assemblyai'
      this.isListening = true
      this.emit()
    } catch (err) {
      if (generation !== this.generation) return
      const message = err instanceof Error ? err.message : 'Failed to start listening'
      this.isListening = false
      this.session = null

      if (this.fallbackToWebSpeech && isWebSpeechAvailable()) {
        this.lastError = null
        this.emit()
        await this.startWebSpeech(generation, message)
        return
      }

      this.lastError = this.typedFallbackHint(message)
      if (this.fallbackToMock) {
        this.provider = 'mock'
        this.isListening = true
        this.lastError = `${message} — type a command below, or use Hold Space after fixing the mic`
      }
      this.emit()
    }
  }

  private typedFallbackHint(message: string): string {
    return `${message}. You can still type a command in the Voice panel.`
  }

  private async startWebSpeech(generation: number, priorError?: string): Promise<void> {
    try {
      const session = startWebSpeechSession({
        onTranscript: (r) => {
          if (generation === this.generation) void this.handleTranscript(r)
        },
        onError: (message) => {
          this.lastError = message
          this.emit()
        },
        onStatus: (status) => {
          if (generation !== this.generation) return
          if (status === 'listening') {
            this.isListening = true
            this.emit()
          }
          if (status === 'stopped') {
            this.isListening = false
            this.session = null
            this.emit()
          }
        },
      })
      if (generation !== this.generation || !this.enabled) {
        await session.stop()
        return
      }
      this.session = session
      this.provider = 'webspeech'
      this.isListening = true
      this.lastError = priorError ? `Using device microphone (browser speech). ${priorError}` : null
      // Clear the advisory once listening is clearly active — keep a short status via lastError only when useful.
      if (priorError) {
        // Keep a gentler note so users know which engine is active.
        this.lastError = 'Listening with your device microphone'
      }
      this.emit()
    } catch (err) {
      if (generation !== this.generation) return
      const message = err instanceof Error ? err.message : 'Failed to start browser speech recognition'
      this.lastError = this.typedFallbackHint(priorError ? `${priorError}. ${message}` : message)
      this.isListening = false
      this.session = null
      if (this.fallbackToMock) {
        this.provider = 'mock'
        this.isListening = true
      }
      this.emit()
    }
  }

  async stopListening(): Promise<void> {
    if (!this.session) {
      ++this.generation
      this.abortStart?.abort()
    }
    if (this.session) {
      await this.session.stop()
      this.session = null
    }
    this.isListening = false
    this.emit()
  }

  /**
   * Process a transcript (from AssemblyAI or mock). Only finals execute.
   */
  async handleTranscript(result: TranscriptResult): Promise<ExecuteResult | null> {
    if (!this.enabled) return null

    if (!result.isFinal) {
      this.lastPartial = result.text
      this.emit()
      return null
    }

    const text = result.text.trim()
    if (!text) return null

    // Duplicate final protection (same text within 2s)
    const now = Date.now()
    const key = text.toLowerCase()
    if (this.lastFinalKey === key && now - this.lastFinalAt < 2000) {
      return null
    }
    this.lastFinalKey = key
    this.lastFinalAt = now

    if (this.processing) return null
    this.processing = true

    try {
      this.lastTranscript = text
      this.lastPartial = null

      const parsed = parseVoiceCommand(text)
      if (!parsed.ok) {
        const message =
          parsed.reason === 'empty'
            ? 'Empty transcript'
            : `Unsupported command: "${text}"`
        this.lastCommand = null
        this.lastResult = { status: 'rejected', message }
        emitVoiceEvent({
          type: 'VOICE_COMMAND_REJECTED',
          transcript: text,
          message,
        })
        this.emit()
        return this.lastResult
      }

      this.lastError = null
      this.lastResult = null
      this.lastCommand = parsed.command
      this.emit()
      emitVoiceEvent({
        type: 'VOICE_COMMAND_RECOGNIZED',
        transcript: text,
        command: parsed.command,
      })

      const execOpts: CommandExecutorOptions = { confirm: this.confirm }
      const execResult = await executeVoiceCommand(parsed.command, execOpts)
      this.lastResult = execResult
      if (execResult.status === 'needs_confirmation') {
        this.pendingConfirmation = execResult
      } else {
        this.pendingConfirmation = null
      }
      this.emit()
      return execResult
    } finally {
      this.processing = false
    }
  }

  /** Convenience: submit text through the same path as a final STT result. */
  async submitTranscript(text: string): Promise<ExecuteResult | null> {
    return this.handleTranscript({ text, isFinal: true })
  }

  /** Dispose — stop mic and detach mock handler. Call on unmount / XR session end. */
  async dispose(): Promise<void> {
    this.enabled = false
    const stopping = this.stopListening()
    this.removeMockHandler?.()
    this.removeMockHandler = null
    this.listeners.clear()
    await stopping
  }
}

/** Shared singleton for desktop + XR consumers (optional). */
let shared: VoiceController | null = null

export function getSharedVoiceController(opts?: VoiceControllerOptions): VoiceController {
  if (!shared) shared = new VoiceController(opts)
  return shared
}

export async function disposeSharedVoiceController(): Promise<void> {
  if (shared) {
    await shared.dispose()
    shared = null
  }
}
