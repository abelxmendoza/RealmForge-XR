/**
 * Executes validated VoiceCommands against the World Action API.
 * Destructive actions require an injected ConfirmHandler — never window.confirm.
 */

import { flowActions } from '../flow/actions'
import { useFlow } from '../flow/store'
import { startNavigation } from '../nav/navigation'
import {
  worldActions,
  type ConfirmReplace,
} from '../world/actions'
import { getEnvironment } from '../world/environment'
import { emitVoiceEvent } from './events'
import { anchorPoint, duplicateObjects, moveObjects, resizeObjects, rotateObjects, spawnObjects, targetIds } from '../world/spawn'
import { useWorld } from '../world/store'
import type { Vec2 } from '../world/types'
import { addWaypoint, clearRoute, pauseRoute, playRoute, removeLastWaypoint, routeStatusLabel, skipToNextWaypoint, stopRoute, useRoutePlan } from '../nav/routePlan'
import { useGuide } from '../guide/guideStore'
import { PAGE_TITLE, backPage, closePalette, currentPage, openPalettePage, setPaletteHidden, summonPalette, usePaletteUI } from '../xr/paletteUI'
import { exitXR } from '../xr/session'
import type { ConfirmationRequest, ConfirmHandler, VoiceCommand } from './types'
import { createWorld, nextWorldName, openWorld } from '../world/library'
import { listSavedWorlds, useWorldLibrary } from '../world/persistence'
import { resumeAutosave } from '../world/autosave'
import { leaveEditor } from '../editor/leaveEditor'
import { deleteObjects } from '../editor/deleteObjects'
import { actionTargets } from '../editor/selection'
import { matchSavedWorld } from './worldCommands'

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
    case 'RESET_WORLD':
      return 'Clear the world and start blank? Unsaved changes will be lost.'
    case 'FLOW_CLEAR_ROUTE':
      return 'Delete the selected route?'
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

function done(command: VoiceCommand, message: string): ExecuteResult {
  emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
  return { status: 'executed', command, message }
}

function reject(command: VoiceCommand, message: string): ExecuteResult {
  emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
  return { status: 'rejected', command, message }
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
        // No confirm: the whole delete is one undo step, and "undo" is one word away.
        const ids = command.which === 'last' ? targetIds('last') : actionTargets().length ? actionTargets() : targetIds('selected')
        const count = deleteObjects(ids)
        if (!count) {
          const message = 'Nothing selected to delete'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const message = `Deleted ${count === 1 ? 'it' : `${count} objects`} — say "undo" to bring ${count === 1 ? 'it' : 'them'} back`
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

      case 'GO_HOME': {
        const dirty = useWorldLibrary.getState().dirty
        if (dirty && !command.force) {
          const gate = await resolveConfirm(
            command,
            'Leave the editor? Unsaved changes may be lost. Say "go home now" to leave without confirming.',
            opts.confirm,
          )
          if (gate.status !== 'confirmed') return gate
        }
        const message = command.force ? 'Leaving for home (forced)' : 'Leaving for home'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        leaveEditor()
        return { status: 'executed', command, message }
      }

      case 'NEW_WORLD':
      case 'OPEN_SAVED_WORLD':
      case 'RESUME_SESSION': {
        const confirmReplace = asConfirmReplace(opts.confirm, command)
        let result: { ok: true } | { ok: false; error: string; cancelled?: boolean }
        let message: string
        if (command.type === 'NEW_WORLD') {
          const base = command.template === 'blank' ? 'My world' : `My ${getEnvironment(command.template)?.name ?? 'world'}`
          const name = command.name ?? nextWorldName(base)
          result = await createWorld(name, command.template, confirmReplace ? { confirmReplace } : {})
          message = `Started new world "${name}"`
        } else if (command.type === 'OPEN_SAVED_WORLD') {
          const match = matchSavedWorld(command.query, listSavedWorlds())
          if (!match) {
            const msg = `No saved world matches "${command.query}"`
            emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message: msg })
            return { status: 'rejected', command, message: msg }
          }
          result = await openWorld(match.id, confirmReplace ? { confirmReplace } : {})
          message = `Opened "${match.name}"`
        } else {
          result = await resumeAutosave(confirmReplace ? { confirmReplace } : {})
          message = 'Resumed your last session'
        }
        if (!result.ok) {
          const status = result.cancelled ? 'rejected' : 'failed'
          emitVoiceEvent({ type: result.cancelled ? 'VOICE_COMMAND_REJECTED' : 'VOICE_COMMAND_FAILED', command, message: result.error })
          return { status, command, message: result.error }
        }
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

      case 'FLOW_CREATE_ROUTE': {
        flowActions.beginRoute('waypoint')
        const message = 'Route drawing started — point and add waypoints'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_ADD_WAYPOINT': {
        const at = flowActions.spatialTarget()
        if (!at) {
          const message = 'Point at the ground first, then say "add waypoint here"'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        if (!useFlow.getState().draft) flowActions.beginRoute('waypoint')
        flowActions.addWaypoint(at)
        const n = useFlow.getState().draft?.waypoints.length ?? 0
        const message = `Waypoint ${n} added`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_FINISH_ROUTE': {
        const route = flowActions.finishRoute()
        if (!route) {
          const message = 'Need at least two waypoints to finish a route'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const message = `Route "${route.name}" saved (${route.status})`
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_CANCEL_ROUTE': {
        flowActions.cancelRoute()
        const message = 'Route draft cancelled'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_RECALCULATE': {
        flowActions.revalidate()
        const message = 'Routes recalculated'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_SHOW_ROUTES': {
        flowActions.setShowRoutes(true)
        const message = 'Routes visible'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_HIDE_ROUTES': {
        flowActions.setShowRoutes(false)
        const message = 'Routes hidden'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_PAUSE': {
        flowActions.pause()
        const message = 'Agents paused'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_RESUME': {
        flowActions.resume()
        const message = 'Agents resumed'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_ASSIGN_ROBOT': {
        const selected = flowActions.getSelectedRoute()
        const id = selected?.id ?? useFlow.getState().activeRouteId ?? Object.keys(useFlow.getState().routes)[0]
        if (!id) {
          const message = 'No route to assign — create one first'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        const result = flowActions.assignToRobot(id)
        if (!result.ok) {
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message: result.error })
          return { status: 'rejected', command, message: result.error }
        }
        const message = 'Route assigned to robot'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_CLEAR_ROUTE': {
        const selected = flowActions.getSelectedRoute()
        if (!selected) {
          const message = 'No route selected'
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message })
          return { status: 'rejected', command, message }
        }
        flowActions.deleteRoute(selected.id)
        const message = 'Selected route deleted'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_AVOID_AREA': {
        const result = flowActions.addZoneAtPointer('no-go')
        if (!result.ok) {
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message: result.error })
          return { status: 'rejected', command, message: result.error }
        }
        const message = 'No-go zone added at pointer'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'FLOW_MAKE_ONE_WAY': {
        const result = flowActions.addZoneAtPointer('one-way')
        if (!result.ok) {
          emitVoiceEvent({ type: 'VOICE_COMMAND_REJECTED', command, message: result.error })
          return { status: 'rejected', command, message: result.error }
        }
        const message = 'One-way zone added at pointer'
        emitVoiceEvent({ type: 'VOICE_COMMAND_EXECUTED', command, message })
        return { status: 'executed', command, message }
      }

      case 'UI_BACK': {
        if (usePaletteUI.getState().closed) {
          summonPalette()
          return done(command, 'Menu opened')
        }
        return backPage() ? done(command, `Back to ${PAGE_TITLE[currentPage()]}`) : reject(command, 'Already on a top page — say “open the build page” or pick a tab')
      }

      case 'UI_PANEL': {
        const { panel, action } = command
        if (panel === 'all') {
          if (action === 'hide' || action === 'collapse') {
            closePalette()
            useGuide.getState().closeGuide()
            return done(command, 'All panels hidden — say “show the menu” to bring it back')
          }
          summonPalette()
          return done(command, 'Menu shown')
        }
        if (panel === 'guide') {
          if (action === 'hide' || action === 'collapse') useGuide.getState().closeGuide()
          else useGuide.getState().openGuide()
          return done(command, action === 'hide' || action === 'collapse' ? 'Guide closed' : 'Guide opened')
        }
        if (action === 'hide') closePalette()
        else if (action === 'collapse') setPaletteHidden(true)
        else summonPalette()
        return done(command, action === 'hide' ? 'Menu hidden — say “show the menu” to bring it back' : action === 'collapse' ? 'Menu collapsed' : 'Menu shown')
      }

      case 'UI_OPEN_PAGE': {
        openPalettePage(command.page)
        return done(command, `${PAGE_TITLE[command.page]} opened`)
      }

      case 'EXIT_XR': {
        return (await exitXR()) ? done(command, 'Left VR') : reject(command, 'Not in VR or AR right now')
      }

      case 'ROUTE_ADD_WAYPOINT': {
        // "here" while drafting a Flow route adds to that draft, as before.
        if (command.here && useFlow.getState().draft) {
          const at = flowActions.spatialTarget()
          if (!at) return reject(command, 'Point at the ground first, then say "add waypoint here"')
          flowActions.addWaypoint(at)
          return done(command, `Flow waypoint added (${useFlow.getState().draft?.waypoints.length ?? 1})`)
        }
        let point: Vec2 | null
        if (command.here) {
          const selected = worldActions.getSelectedId()
          const o = selected ? useWorld.getState().objects[selected] : null
          point = flowActions.spatialTarget() ?? (o ? [o.position[0], o.position[2]] : null)
          if (!point) return reject(command, 'Point at the ground first, or say where: "add a waypoint at the goal"')
        } else {
          if (command.to === 'goal' && !worldActions.getGoal()) return reject(command, 'There is no goal yet — say "add a waypoint near the robot" instead')
          if (command.to === 'selected' && !worldActions.getSelectedId()) return reject(command, 'Nothing is selected')
          point = anchorPoint({ anchor: command.to, direction: command.direction, distance: command.distance })
        }
        const r = addWaypoint(point)
        if (!r.ok) return reject(command, r.error)
        return done(command, `Waypoint ${r.index + 1} added — say "start the route" to drive it`)
      }

      case 'ROUTE_REMOVE_LAST': {
        const r = removeLastWaypoint()
        return r.ok ? done(command, `Removed the last waypoint (${useRoutePlan.getState().waypoints.length} left)`) : reject(command, r.error)
      }

      case 'ROUTE_CLEAR': {
        if (!useRoutePlan.getState().waypoints.length) return reject(command, 'There are no waypoints to clear')
        clearRoute()
        return done(command, 'Waypoints cleared')
      }

      case 'ROUTE_PLAY': {
        const r = playRoute()
        return r.ok ? done(command, routeStatusLabel()) : reject(command, r.error)
      }

      case 'ROUTE_PAUSE': {
        const r = pauseRoute()
        return r.ok ? done(command, 'Route paused — say "resume the route" to continue') : reject(command, r.error)
      }

      case 'ROUTE_STOP': {
        stopRoute()
        return done(command, 'Route stopped')
      }

      case 'ROUTE_NEXT': {
        const r = skipToNextWaypoint()
        return r.ok ? done(command, routeStatusLabel()) : reject(command, r.error)
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
