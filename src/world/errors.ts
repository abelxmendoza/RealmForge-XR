import type { ReplaceResult } from './persistence'

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

export function fail(error: string, cancelled = false): Extract<ReplaceResult, { ok: false }> {
  return cancelled ? { ok: false, error, cancelled: true } : { ok: false, error }
}

export function ok(warnings: string[] = []): Extract<ReplaceResult, { ok: true }> {
  return { ok: true, warnings }
}

/** Run an async confirm callback; convert throws into a deniable result. */
export async function safeConfirm(
  confirm: ((message: string) => boolean | Promise<boolean>) | undefined,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string; cancelled?: boolean }> {
  if (!confirm) {
    return fail('Confirmation required to replace a non-empty world. Pass confirmReplace.', true)
  }
  try {
    const accepted = await confirm(message)
    if (!accepted) return fail('Cancelled.', true)
    return { ok: true }
  } catch (error) {
    return fail(`Confirmation failed: ${toErrorMessage(error)}`)
  }
}
