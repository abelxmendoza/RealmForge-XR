import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'
import type { AnchorName, Direction, Placement, SpawnSpec } from '../world/spawn'
import type { TemplateId } from '../world/library'

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
  /** "start a new Mars world called harbor": creates it and saves it to the library */
  | { type: 'NEW_WORLD'; template: TemplateId; name?: string }
  /** "open my harbor world": best match among saved worlds */
  | { type: 'OPEN_SAVED_WORLD'; query: string }
  /** "resume": bring back the auto-saved last session */
  | { type: 'RESUME_SESSION' }
  /** "add three trees near the robot" */
  | { type: 'SPAWN_OBJECTS'; spec: SpawnSpec; label: string; count: number; placement: Placement }
  /** "move it 10 meters north", "move them to the goal" ("it" = selection, "them" = last batch) */
  | { type: 'MOVE_OBJECTS'; which: 'selected' | 'last'; direction?: Direction; distance?: number; to?: Exclude<AnchorName, 'auto' | 'selected'> }
  | { type: 'ROTATE_OBJECTS'; which: 'selected' | 'last'; degrees: number }
  | { type: 'RESIZE_OBJECTS'; which: 'selected' | 'last'; factor: number; axis: 'all' | 'height' | 'footprint' }
  | { type: 'DUPLICATE_OBJECTS'; which: 'selected' | 'last'; count: number }

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
