import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'
import type { AnchorName, Direction, Placement, SpawnSpec } from '../world/spawn'
import type { TemplateId } from '../world/library'
import type { PalettePage } from '../xr/paletteUI'

/** Deterministic voice intents — executed only after validation. */
export type VoiceCommand =
  | { type: 'LOAD_ENVIRONMENT'; environmentId: EnvironmentId }
  | { type: 'SELECT_TOOL'; tool: Tool }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_WORLD'; name?: string }
  /** "delete it" / "remove that" (selection or framed group); "delete them" = what the last command made */
  | { type: 'DELETE_SELECTED'; which?: 'selected' | 'last' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_WORLD' }
  | { type: 'START_NAVIGATION' }
  /** "start a new Mars world called harbor": creates it and saves it to the library */
  | { type: 'NEW_WORLD'; template: TemplateId; name?: string }
  /** "open my harbor world": best match among saved worlds */
  | { type: 'OPEN_SAVED_WORLD'; query: string }
  /** "resume": bring back the auto-saved last session */
  | { type: 'RESUME_SESSION' }
  /**
   * Leave the editor for the landing page.
   * `force: true` skips the unsaved-changes confirm — escape hatch for stuck UI ("go home now").
   */
  | { type: 'GO_HOME'; force?: boolean }
  /** "add three trees near the robot" */
  | { type: 'SPAWN_OBJECTS'; spec: SpawnSpec; label: string; count: number; placement: Placement }
  /** "move it 10 meters north", "move them to the goal" ("it" = selection, "them" = last batch) */
  | { type: 'MOVE_OBJECTS'; which: 'selected' | 'last'; direction?: Direction; distance?: number; to?: Exclude<AnchorName, 'auto' | 'selected'> }
  | { type: 'ROTATE_OBJECTS'; which: 'selected' | 'last'; degrees: number }
  | { type: 'RESIZE_OBJECTS'; which: 'selected' | 'last'; factor: number; axis: 'all' | 'height' | 'footprint' }
  | { type: 'DUPLICATE_OBJECTS'; which: 'selected' | 'last'; count: number }
  /** RealmForge Flow — spatial path planning (pointer supplies coordinates). */
  | { type: 'FLOW_CREATE_ROUTE' }
  | { type: 'FLOW_ADD_WAYPOINT' }
  | { type: 'FLOW_FINISH_ROUTE' }
  | { type: 'FLOW_CANCEL_ROUTE' }
  | { type: 'FLOW_RECALCULATE' }
  | { type: 'FLOW_SHOW_ROUTES' }
  | { type: 'FLOW_HIDE_ROUTES' }
  | { type: 'FLOW_PAUSE' }
  | { type: 'FLOW_RESUME' }
  | { type: 'FLOW_ASSIGN_ROBOT' }
  | { type: 'FLOW_CLEAR_ROUTE' }
  | { type: 'FLOW_AVOID_AREA' }
  | { type: 'FLOW_MAKE_ONE_WAY' }
  /** Headset navigation (uiCommands.ts): palette back a page, panels, pages, leave XR. */
  | { type: 'UI_BACK' }
  | { type: 'UI_PANEL'; panel: 'menu' | 'guide' | 'all'; action: 'show' | 'hide' | 'collapse' | 'expand' }
  | { type: 'UI_OPEN_PAGE'; page: PalettePage }
  | { type: 'EXIT_XR' }
  /** The robot's route stops (nav/routePlan.ts). `here` = where you point (else the selection). */
  | { type: 'ROUTE_ADD_WAYPOINT'; to?: Exclude<AnchorName, 'auto'>; direction?: Direction; distance?: number; here?: boolean }
  | { type: 'ROUTE_REMOVE_LAST' }
  | { type: 'ROUTE_CLEAR' }
  | { type: 'ROUTE_PLAY' }
  | { type: 'ROUTE_PAUSE' }
  | { type: 'ROUTE_STOP' }
  | { type: 'ROUTE_NEXT' }

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
