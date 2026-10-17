/**
 * Executes validated VoiceCommands against the World Action API.
 * Destructive actions require an injected ConfirmHandler — never window.confirm.
 */

import { startNavigation } from '../nav/navigation'
import {
  worldActions,
  type ConfirmReplace,
} from '../world/actions'
import { getEnvironment } from '../world/environment'
import { emitVoiceEvent } from './events'
import { duplicateObjects, moveObjects, resizeObjects, rotateObjects, spawnObjects, targetIds } from '../world/spawn'
import type { ConfirmationRequest, ConfirmHandler, VoiceCommand } from './types'

export type ExecuteResult =
  | { status: 'executed'; command: VoiceCommand; message: string }
  | { status: 'rejected'; command?: VoiceCommand; message: string }
  | { status: 'failed'; command?: VoiceCommand; message: string }
  | { status: 'needs_confirmation'; request: ConfirmationRequest }

export type CommandExecutorOptions = {
  /** Resolves destructive confirms (desktop dialog or XR panel). */
  confirm?: ConfirmHandler
}

function needsConfirmation(command: VoiceCommand): string | null {
  switch (command.type) {
    case 'LOAD_ENVIRONMENT':
      return `Load "${getEnvironment(command.environmentId)?.name ?? command.environmentId}" and replace the current world?`
    case 'DELETE_SELECTED':
      return 'Delete the selected object?'
    case 'RESET_WORLD':
      return 'Clear the world and start blank? Unsaved changes will be lost.'
    default:
      return null
  }
}

async function resolveConfirm(
  command: VoiceCommand,
  message: string,
  confirm: ConfirmHandler | undefined,
): Promise<ExecuteResult | { status: 'confirmed' }> {
  const request: ConfirmationRequest = {
    id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: command,
    message,
  }

  if (!confirm) {
    emitVoiceEvent({ type: 'VOICE_CONFIRMATION_REQUIRED', request })
    emitVoiceEvent({
      type: 'VOICE_COMMAND_REJECTED',
      command,
      message: 'Confirmation required — no confirm handler connected.',
    })
    return { status: 'needs_confirmation', request }
  }

  const accepted = await confirm(request)
  if (!accepted) {
    emitVoiceEvent({
      type: 'VOICE_COMMAND_REJECTED',
      command,
      message: 'Cancelled by user.',
    })
    return { status: 'rejected', command, message: 'Cancelled by user.' }
  }
  return { status: 'confirmed' }
}

function asConfirmReplace(confirm: ConfirmHandler | undefined, command: VoiceCommand): ConfirmReplace | undefined {
  if (!confirm) return undefined
  return async (message: string) => {
    const request: ConfirmationRequest = {
      id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: command,
      message,
    }
    emitVoiceEvent({ type: 'VOICE_CONFIRMATION_REQUIRED', request })
    return confirm(request)
  }
}

/**
 * Run a single parsed command. Emits voice events for Agent 3 / UI / XR.
 */
export async function executeVoiceCommand(
  command: VoiceCommand,
  opts: CommandExecutorOptions = {},
): Promise<ExecuteResult> {
  const confirmMsg = needsConfirmation(command)

  // Gate destructive commands before touching world state when we own the confirm UX.
  // LOAD_ENVIRONMENT also confirms inside worldActions when non-empty; we still require
  // a handler up-front so empty-world loads don't skip the UX contract for replace-capable cmds.
  if (confirmMsg && command.type !== 'LOAD_ENVIRONMENT') {
    const gate = await resolveConfirm(command, confirmMsg, opts.confirm)
    if (gate.status !== 'confirmed') return gate
  }

  try {
    switch (command.type) {
      case 'SELECT_TOOL': {
        worldActions.setTool(command.tool)
        const message = `Selected ${command.tool} tool`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'UNDO': {
        const ok = worldActions.undo()
        if (!ok) {
          const message = 'Nothing to undo'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const message = 'Undo'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'REDO': {
        const ok = worldActions.redo()
        if (!ok) {
          const message = 'Nothing to redo'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const message = 'Redo'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'SAVE_WORLD': {
        const name = command.name?.trim() || undefined
        const result = name
          ? worldActions.saveWorld(name)
          : await worldActions.quickSave(undefined, {
              confirmOverwrite: opts.confirm
                ? async (message) => {
                    const gate = await resolveConfirm(command, message, opts.confirm)
                    return gate.status === 'confirmed'
                  }
                : undefined,
            })
        if (!result.ok) {
          const message = result.cancelled ? 'Save cancelled' : result.error
          emitVoiceEvent({
            type: result.cancelled ? 'VOICE_COMMAND_REJECTED' : 'VOICE_COMMAND_FAILED',
            command,
            message,
          })
          return { status: result.cancelled ? 'rejected' : 'failed', command, message }
        }
        const message = `Saved world "${result.value.name}"`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'CLEAR_SELECTION': {
        worldActions.selectObject(null)
        const message = 'Selection cleared'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'DELETE_SELECTED': {
        const id = worldActions.getSelectedId()
        if (!id) {
          const message = 'No object selected'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        worldActions.deleteObject(id)
        worldActions.selectObject(null)
        const message = 'Deleted selected object'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'RESET_WORLD': {
        // Confirmed above. Apply empty snapshot via World Action API.
        const count = worldActions.objectCount()
        if (count > 0 && !opts.confirm) {
          // Should have been gated already; belt-and-suspenders.
          const gate = await resolveConfirm(command, confirmMsg!, opts.confirm)
          if (gate.status !== 'confirmed') return gate
        }
        worldActions.applyWorldSnapshot({
          objects: [],
          robotEnabled: false,
          robotStart: [0, 5],
          goal: null,
        })
        const message = 'Blank world created'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'LOAD_ENVIRONMENT': {
        const confirmReplace = asConfirmReplace(opts.confirm, command)
        // When world is non-empty and no confirm handler, worldActions returns cancelled.
        if (worldActions.objectCount() > 0 && !confirmReplace) {
          const message =
            confirmMsg ??
            'Confirmation required to replace the current world.'
          const request: ConfirmationRequest = {
            id: `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: command,
            message,
          }
          emitVoiceEvent({ type: 'VOICE_CONFIRMATION_REQUIRED', request })
          emitVoiceEvent({
            type: 'VOICE_COMMAND_REJECTED',
            command,
            message: 'Confirmation required — no confirm handler connected.',
          })
          return { status: 'needs_confirmation', request }
        }

        const result = await worldActions.loadEnvironment(command.environmentId, {
          confirmReplace,
        })
        if (!result.ok) {
          if (result.cancelled) {
            emitVoiceEvent({
              type: 'VOICE_COMMAND_REJECTED',
              command,
              message: result.error,
            })
            return { status: 'rejected', command, message: result.error }
          }
          emitVoiceEvent({ type: 'VOICE_COMMAND_FAILED', command, message: result.error })
          return { status: 'failed', command, message: result.error }
        }
        const envName = getEnvironment(command.environmentId)?.name ?? command.environmentId
        const message = `${envName} loaded`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'START_NAVIGATION': {
        const goal = worldActions.getGoal()
        if (!goal) {
          const message = 'No destination set — say "set destination" first'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        startNavigation()
        // Re-apply goal to force a replan if nav was idle.
        worldActions.setGoal([goal[0], goal[1]])
        const message = 'Navigation started'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'SPAWN_OBJECTS': {
        const { ids, requested } = spawnObjects(command.spec, command.count, command.placement)
        if (!ids.length) {
          const message = `No free space for ${command.label}s there`
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const noun = ids.length === 1 ? command.label : `${command.label}s`
        const message = ids.length < requested ? `Added ${ids.length} of ${requested} ${noun} (out of free space)` : `Added ${ids.length} ${noun}`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'MOVE_OBJECTS':
      case 'ROTATE_OBJECTS':
      case 'RESIZE_OBJECTS':
      case 'DUPLICATE_OBJECTS': {
        const ids = targetIds(command.which)
        if (!ids.length) {
          const message = 'Nothing selected. Select an object or add some first.'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const things = ids.length === 1 ? 'object' : `${ids.length} objects`
        let message: string
        if (command.type === 'MOVE_OBJECTS') {
          moveObjects(ids, command)
          message = command.to ? `Moved ${things} to the ${command.to}` : `Moved ${things} ${command.distance ?? 5} m ${command.direction}`
        } else if (command.type === 'ROTATE_OBJECTS') {
          rotateObjects(ids, command.degrees)
          message = `Rotated ${things} ${Math.abs(command.degrees)}°`
        } else if (command.type === 'RESIZE_OBJECTS') {
          resizeObjects(ids, command.factor, command.axis)
          message = `Resized ${things}`
        } else {
          const r = duplicateObjects(ids[ids.length - 1], command.count)
          message = r.ids.length ? `Made ${r.ids.length} ${r.ids.length === 1 ? 'copy' : 'copies'}` : 'No free space for copies'
        }
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      default: {
        const _exhaustive: never = command
        void _exhaustive
        const message = 'Unsupported command'
        emitVoiceEvent({ type: 'VOICE_COMMAND_FAILED', message })
        return { status: 'failed', message }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Command execution failed'
    emitVoiceEvent({ type: 'VOICE_COMMAND_FAILED', command, message })
    return { status: 'failed', command, message }
  }
}
