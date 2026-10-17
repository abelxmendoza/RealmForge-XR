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
        const result = name ? worldActions.saveWorld(name) : worldActions.quickSave()
        if (!result.ok) {
          emitVoiceEvent({ type: 'VOICE_COMMAND_FAILED', command, message: result.error })
          return { status: 'failed', command, message: result.error }
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
