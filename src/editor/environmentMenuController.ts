import { worldActions, type EnvironmentId } from '../world/actions'
import { confirmReplace } from '../world/confirmation'
import { fail, toErrorMessage } from '../world/errors'
import { normalizeEnvironmentId } from '../world/environment'
import type { ReplaceResult } from '../world/persistence'

export type EnvMenuFeedback =
  | { kind: 'idle' }
  | { kind: 'loading'; id: EnvironmentId }
  | { kind: 'ready'; id: EnvironmentId }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

export type EnvMenuLoadOptions = {
  confirmReplace?: typeof confirmReplace
  /** Injected for tests — defaults to worldActions.loadEnvironment. */
  load?: (id: string, opts: { confirmReplace?: typeof confirmReplace }) => Promise<ReplaceResult>
}

let busy = false

export function isEnvironmentLoadBusy(): boolean {
  return busy
}

/** Short HUD labels for environment chips. */
export function environmentShortName(name: string): string {
  if (name.startsWith('Forge')) return 'Forge'
  if (name.startsWith('Mars')) return 'Mars'
  if (name.startsWith('Autonomous')) return 'Warehouse'
  const first = name.trim().split(/\s+/)[0]
  return first || 'Env'
}

/**
 * Load an environment from a menu click. Rejects overlapping loads, never throws,
 * and returns UI feedback suitable for toast / aria-live regions.
 */
export async function loadEnvironmentFromMenu(
  id: string,
  opts: EnvMenuLoadOptions = {},
): Promise<{ result: ReplaceResult; feedback: EnvMenuFeedback }> {
  if (busy) {
    const result = fail('An environment is already loading. Wait for it to finish.')
    return { result, feedback: { kind: 'error', message: result.error } }
  }

  const envId = normalizeEnvironmentId(id)
  if (!envId) {
    const result = fail(typeof id === 'string' && id.trim() ? `Unknown environment: ${id.trim()}` : 'Unknown environment: (empty id)')
    return { result, feedback: { kind: 'error', message: result.error } }
  }

  const load = opts.load ?? ((envIdArg, loadOpts) => worldActions.loadEnvironment(envIdArg, loadOpts))
  const confirm = opts.confirmReplace ?? confirmReplace

  busy = true
  try {
    const result = await load(envId, { confirmReplace: confirm })
    if (result.ok) return { result, feedback: { kind: 'ready', id: envId } }
    if (result.cancelled) return { result, feedback: { kind: 'cancelled' } }
    return { result, feedback: { kind: 'error', message: result.error } }
  } catch (error) {
    const result = fail(`Environment load crashed: ${toErrorMessage(error)}`)
    return { result, feedback: { kind: 'error', message: result.error } }
  } finally {
    busy = false
  }
}

/** Test helper — clear the in-flight guard. */
export function resetEnvironmentMenuController() {
  busy = false
}
