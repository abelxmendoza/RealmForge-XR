import type { ReplaceResult, SaveResult } from '../world/persistence'
import { fail, toErrorMessage } from '../world/errors'

/**
 * What the two world menus share: the Inspector's Worlds panel (worldsMenuController) and the World Library
 * modal (libraryMenuController). They used to carry copies of this with a busy flag each, so a save from one
 * could run while the other was loading a world; now one flag guards both.
 */
export type WorldMenuFeedback =
  | { kind: 'idle' }
  | { kind: 'busy'; action: string }
  | { kind: 'ok'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

let busy = false

export const isWorldMenuBusy = () => busy

export function resetWorldMenuBusy() {
  busy = false
}

export function feedbackFromReplace(result: ReplaceResult, done: string): WorldMenuFeedback {
  if (result.ok) {
    return {
      kind: 'ok',
      message: result.warnings.length ? `${done} with ${result.warnings.length} fix(es): ${result.warnings[0]}` : done,
    }
  }
  if (result.cancelled) return { kind: 'cancelled' }
  return { kind: 'error', message: result.error }
}

export function feedbackFromSave(result: SaveResult, verb = 'Saved'): WorldMenuFeedback {
  if (result.ok) return { kind: 'ok', message: `${verb} "${result.value.name}".` }
  if (result.cancelled) return { kind: 'cancelled' }
  return { kind: 'error', message: result.error }
}

/** Run one world action at a time; a crash comes back as an error result, never a throw. */
export async function withBusy<T>(action: string, run: () => Promise<{ result: T; feedback: WorldMenuFeedback }>) {
  if (busy) {
    const message = 'Another world action is already running. Wait for it to finish.'
    return { result: fail(message) as T, feedback: { kind: 'error' as const, message } }
  }
  busy = true
  try {
    return await run()
  } catch (error) {
    const message = `${action} crashed: ${toErrorMessage(error)}`
    return { result: fail(message) as T, feedback: { kind: 'error' as const, message } }
  } finally {
    busy = false
  }
}
