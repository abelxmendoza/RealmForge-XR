import type { EnvironmentId } from '../world/environment'
import type { Tool } from '../world/store'
import type { AnchorName, Direction, Placement, SpawnSpec } from '../world/spawn'
import type { TemplateId } from '../world/library'
import type { Target } from '../world/targets'
import type { ObjectPatch, SizeAxis } from '../world/edit'
import type { ActorKind } from '../actors/types'
import type { ActorBehaviour } from '../world/compose'

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
  /**
   * Leave the editor for the landing page.
   * `force: true` skips the unsaved-changes confirm — escape hatch for stuck UI ("go home now").
   */
  | { type: 'GO_HOME'; force?: boolean }
  /** "add three trees near the robot"; `alongRoad` lines them up along the latest road */
  | { type: 'SPAWN_OBJECTS'; spec: SpawnSpec; label: string; count: number; placement: Placement; alongRoad?: boolean }
  /** "a few people walking around" */
  | { type: 'SPAWN_ACTORS'; actorKind: ActorKind; label: string; count: number; placement: Placement; behaviour?: ActorBehaviour }
  /** "move it 10 meters north", "move them to the goal" ("it" = selection, "them" = last batch); `target` names things ("the houses") */
  | { type: 'MOVE_OBJECTS'; which: 'selected' | 'last'; direction?: Direction; distance?: number; to?: Exclude<AnchorName, 'auto' | 'selected'>; target?: Target }
  | { type: 'ROTATE_OBJECTS'; which: 'selected' | 'last'; degrees: number; target?: Target }
  | { type: 'RESIZE_OBJECTS'; which: 'selected' | 'last'; factor: number; axis: 'all' | 'height' | 'footprint'; target?: Target }
  | { type: 'DUPLICATE_OBJECTS'; which: 'selected' | 'last'; count: number; target?: Target }
  /** "make the road 20 meters long", "make the tower 3 times taller" */
  | { type: 'SIZE_OBJECTS'; target: Target; axis: SizeAxis; factor?: number; metres?: number }
  /** "make the houses brick", "pitched roofs", "paint it red" */
  | { type: 'EDIT_OBJECTS'; target: Target; patch: ObjectPatch }
  /** "remove the trees", "delete the people" (asks first when it is more than a few) */
  | { type: 'DELETE_OBJECTS'; target: Target }
  /** "have the people walk around", "send the workers to the goal", "make them stop" */
  | { type: 'ACTOR_BEHAVIOUR'; target: Target; behaviour: 'wander' | 'goal' | 'stop' | 'faster' | 'slower' }
  /**
   * Several commands from one sentence ("add 3 lampposts, a road and two houses"), run as one undo
   * step. Spawns next to each other are laid out together as a scene. `skipped` = pieces not understood.
   */
  | { type: 'BATCH'; commands: VoiceCommand[]; skipped: string[]; summary?: string }
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
