import {
  selectActorKind,
  previewActor,
  placeActor,
  selectActor,
  updateActor,
  setActorGoal,
  appendActorWaypoint,
  sendActorToDestination,
  appendActorDestination,
  duplicateActor,
  removeActor,
} from '../actors/actions'
export {
  selectActorKind,
  previewActor,
  placeActor,
  selectActor,
  updateActor,
  setActorGoal,
  appendActorWaypoint,
  sendActorToDestination,
  appendActorDestination,
  duplicateActor,
  removeActor,
} from '../actors/actions'
import { selectCatalogAsset, rotateCatalogAsset, previewCatalogAsset, placeCatalogAsset, listDestinations, sendRobotToDestination } from './assetActions'
export { selectCatalogAsset, rotateCatalogAsset, previewCatalogAsset, placeCatalogAsset, listDestinations, sendRobotToDestination } from './assetActions'
export { flowActions } from '../flow/actions'
/**
 * XR-compatible World Action API — thin facade over existing stores.
 *
 * Does NOT create a second Zustand store. Desktop and Quest both call these
 * functions; pointer/hand input stays in Emiliano's XR layer.
 *
 * Confirmation: destructive replace operations never fall back to window.confirm
 * here. Pass `confirmReplace` from an XR dialog or desktop UI.
 */

import { createWorld, duplicateWorld, listTemplates, nextWorldName } from './library'
import { clearRoute, setImmediateDestination } from '../nav/routePlan'
import { useWorld, type Tool, type WorldSnapshot } from './store'
import type { Vec2, WorldObject } from './types'
import {
  deleteSavedWorld,
  exportWorld,
  listSavedWorlds,
  loadSavedWorld,
  quickSave,
  renameSavedWorld,
  saveWorld,
  useWorldLibrary,
  type ConfirmReplace,
  type ReplaceResult,
  type Result,
  type SaveResult,
  type SavedWorldMeta,
} from './persistence'
import { getHistoryState, redo, undo, type HistoryState } from './history'
import {
  getEnvironment,
  isEnvironmentId,
  listEnvironments,
  loadEnvironment,
  normalizeEnvironmentId,
  useEnvironment,
  type EnvironmentId,
  type LoadEnvironmentOptions,
} from './environment'
import { safeConfirm } from './errors'

// ---------- Confirmation ----------

export type { ConfirmReplace }

export interface ConfirmOptions {
  /** Required when the current world has objects and the action would replace it. */
  confirmReplace?: ConfirmReplace
}

/** How many objects are in the active world (0 = empty sandbox). */
export function objectCount(): number {
  return Object.keys(useWorld.getState().objects).length + Object.keys(useWorld.getState().actors).length
}

/**
 * Gate for replace operations. Returns a cancelled result when the world is
 * non-empty and no confirmReplace was provided — never calls window.confirm.
 */
export async function requireReplaceConfirm(
  message: string,
  opts: ConfirmOptions,
): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  const count = objectCount()
  if (count === 0) return { ok: true }
  const gate = await safeConfirm(
    opts.confirmReplace,
    `${message}\n\nThe current world (${count} objects) will be replaced. Unsaved changes are lost.`,
  )
  if (!gate.ok && !opts.confirmReplace) {
    return {
      ok: false,
      error: 'Confirmation required to replace a non-empty world. Pass confirmReplace.',
      cancelled: true,
    }
  }
  return gate
}

// ---------- Tools & selection ----------

export function setTool(tool: Tool): void {
  useWorld.getState().setTool(tool)
}

export function getTool(): Tool {
  return useWorld.getState().tool
}

export function selectObject(id: string | null): void {
  useWorld.getState().select(id)
}

export function getSelectedId(): string | null {
  return useWorld.getState().selectedId
}

// ---------- Object CRUD / manipulation ----------

export function createObject(o: Omit<WorldObject, 'id'> & { id?: string }): string {
  return useWorld.getState().addObject(o)
}

export function updateObject(id: string, patch: Partial<Omit<WorldObject, 'id'>>): void {
  useWorld.getState().updateObject(id, patch)
}

export function deleteObject(id: string): void {
  useWorld.getState().removeObject(id)
}

export function duplicateObject(id: string): string | null {
  return useWorld.getState().duplicateObject(id)
}

/** Low-level world replace — caller must have already confirmed if needed. */
export function applyWorldSnapshot(world: WorldSnapshot): void {
  clearRoute()
  useWorld.getState().loadWorld(world)
  // Restore a single preset goal as an immediate destination when the snapshot includes one.
  if (world.goal) setImmediateDestination(world.goal)
}

// ---------- Robot ----------

export function setGoal(point: Vec2 | null): void {
  // Voice / destinations: immediate single-stop route. Plan Routes "Add Waypoint" uses addWaypoint instead.
  if (!point) {
    clearRoute()
    return
  }
  setImmediateDestination(point)
}

export function placeRobot(point: Vec2): void {
  useWorld.getState().placeRobot(point)
}

export function getRobotStart(): Vec2 {
  return useWorld.getState().robotStart
}

export function getGoal(): Vec2 | null {
  return useWorld.getState().goal
}

// ---------- Environments ----------

export { listEnvironments, getEnvironment, isEnvironmentId, normalizeEnvironmentId, useEnvironment }
export type { EnvironmentId }

/**
 * Load a named environment (forge-district | mars-outpost | warehouse).
 * XR-safe: requires confirmReplace when the world is non-empty.
 */
export function loadEnvironmentAction(
  id: EnvironmentId | string,
  opts: LoadEnvironmentOptions = {},
): Promise<ReplaceResult> {
  return loadEnvironment(id, opts)
}

// ---------- Undo / redo ----------

export { undo, redo, getHistoryState }
export type { HistoryState }

// ---------- Persistence (XR-oriented) ----------

export { listSavedWorlds, saveWorld, quickSave, renameSavedWorld, deleteSavedWorld, exportWorld, useWorldLibrary }
export type { SavedWorldMeta, SaveResult, Result, ReplaceResult }

/**
 * Load a browser-saved world. XR-safe wrapper: does not use window.confirm.
 * Pass confirmReplace from the headset UI when the current world is non-empty.
 */
export async function loadSavedWorldAction(id: string, opts: ConfirmOptions = {}): Promise<ReplaceResult> {
  const gate = await requireReplaceConfirm(`Load saved world?`, opts)
  if (!gate.ok) return gate
  return loadSavedWorld(id, { confirmReplace: () => true })
}

/**
 * Namespace object for menu wiring — same functions as named exports.
 * Prefer named imports in app code; use `worldActions` in XR menus for a single import.
 */
export { createWorld, duplicateWorld, listTemplates, nextWorldName }
export type { TemplateId, WorldTemplate } from './library'

export const worldActions = {
  // confirm
  objectCount,
  requireReplaceConfirm,

  selectCatalogAsset,
  rotateCatalogAsset,
  previewCatalogAsset,
  placeCatalogAsset,
  listDestinations,
  sendRobotToDestination,

  selectActorKind,
  previewActor,
  placeActor,
  selectActor,
  updateActor,
  setActorGoal,
  appendActorWaypoint,
  sendActorToDestination,
  appendActorDestination,
  duplicateActor,
  removeActor,

  // tools
  setTool,
  getTool,
  selectObject,
  getSelectedId,

  // objects
  createObject,
  updateObject,
  deleteObject,
  duplicateObject,
  applyWorldSnapshot,

  // robot
  setGoal,
  placeRobot,
  getRobotStart,
  getGoal,

  // environments
  listEnvironments,
  getEnvironment,
  isEnvironmentId,
  normalizeEnvironmentId,
  loadEnvironment: loadEnvironmentAction,

  // history
  undo,
  redo,
  getHistoryState,

  // persistence
  listSavedWorlds,
  saveWorld,
  quickSave,
  loadSavedWorld: loadSavedWorldAction,
  renameSavedWorld,
  deleteSavedWorld,
  exportWorld,

  // library (new worlds from templates, copies)
  listTemplates,
  createWorld,
  duplicateWorld,
  nextWorldName,
} as const

export type WorldActions = typeof worldActions
