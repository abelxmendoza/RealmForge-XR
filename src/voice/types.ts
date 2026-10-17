import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'

/** Deterministic voice intents — executed only after validation. */
export type VoiceCommand =
  | { type: 'LOAD_ENVIRONMENT'; environmentId: EnvironmentId }
  | { type: 'SELECT_TOOL'; tool: Tool }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_WORLD'; name?: string }
  | { type: 'DELETE_SELECTED' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_WORLD' }
  | { type: 'START_NAVIGATION' }

export type ParseResult =
  | { ok: true; command: VoiceCommand }
  | { ok: false; reason: 'empty' | 'unsupported'; transcript: string }

export type ConfirmationRequest = {
  id: string
  action: VoiceCommand
  message: string
}

export type VoiceEvent =
  | { type: 'VOICE_COMMAND_RECOGNIZED'; transcript: string; command: VoiceCommand }
  | { type: 'VOICE_COMMAND_EXECUTED'; command: VoiceCommand; message: string }
  | { type: 'VOICE_COMMAND_REJECTED'; command?: VoiceCommand; transcript?: string; message: string }
  | { type: 'VOICE_COMMAND_FAILED'; command?: VoiceCommand; message: string }
  | { type: 'VOICE_CONFIRMATION_REQUIRED'; request: ConfirmationRequest }

export type VoiceEventListener = (event: VoiceEvent) => void

export type ConfirmHandler = (request: ConfirmationRequest) => boolean | Promise<boolean>

export type TranscriptResult = {
  text: string
  /** Only finals are executed. */
  isFinal: boolean
}
