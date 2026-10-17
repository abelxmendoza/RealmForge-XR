import type { ReplaceResult, Result, SaveResult } from './persistence'

/** Normalize any thrown value into a short, user-safe message. */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error == null) return fallback
  if (typeof error === 'string') {
    const trimmed = error.trim()
    return trimmed || fallback
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim()
    return trimmed || fallback
  }
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    const trimmed = (error as { message: string }).message.trim()
    return trimmed || fallback
  }
  try {
    return String(error)
  } catch {
    return fallback
  }
}

/** Browser storage quota / access failures → stable user copy. */
export function describeStorageError(error: unknown): string {
  const name = (error as { name?: string })?.name
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Browser storage is full. Delete a saved world or export it to a file.'
  }
  return `Browser storage error: ${toErrorMessage(error, 'unknown storage failure')}`
}

export function fail(error: string, cancelled = false): Extract<ReplaceResult, { ok: false }> {
  return cancelled ? { ok: false, error, cancelled: true } : { ok: false, error }
}

export function ok(warnings: string[] = []): Extract<ReplaceResult, { ok: true }> {
  return { ok: true, warnings }
}

export function failResult(error: string): Extract<Result, { ok: false }> {
  return { ok: false, error }
}

export function failSave(error: string, cancelled = false): Extract<SaveResult, { ok: false }> {
  return cancelled ? { ok: false, error, cancelled: true } : { ok: false, error }
}

/** Run an async confirm callback; convert throws into a deniable result. */
export async function safeConfirm(
  confirm: ((message: string) => boolean | Promise<boolean>) | undefined,
  message: string,
  missingMessage = 'Confirmation required to replace a non-empty world. Pass confirmReplace.',
): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  if (!confirm) return fail(missingMessage, true)
  try {
    const accepted = await confirm(message)
    if (!accepted) return fail('Cancelled.', true)
    return { ok: true }
  } catch (error) {
    return fail(`Confirmation failed: ${toErrorMessage(error)}`)
  }
}

/** Never-throw wrapper for Result-producing operations used by UI menus. */
export async function guardAsync<T extends { ok: boolean }>(
  run: () => Promise<T>,
  crashPrefix = 'Operation failed',
): Promise<T | { ok: false; error: string }> {
  try {
    return await run()
  } catch (error) {
    return { ok: false, error: `${crashPrefix}: ${toErrorMessage(error)}` }
  }
}

export function guardSync<T extends { ok: boolean }>(run: () => T, crashPrefix = 'Operation failed'): T | { ok: false; error: string } {
  try {
    return run()
  } catch (error) {
    return { ok: false, error: `${crashPrefix}: ${toErrorMessage(error)}` }
  }
}
