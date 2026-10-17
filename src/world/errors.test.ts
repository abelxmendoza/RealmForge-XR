import { describe, expect, it } from 'vitest'
import { fail, ok, safeConfirm, toErrorMessage } from './errors'

describe('toErrorMessage', () => {
  it('handles strings, Errors, and odd values', () => {
    expect(toErrorMessage(' boom ')).toBe('boom')
    expect(toErrorMessage(new Error('nope'))).toBe('nope')
    expect(toErrorMessage({ message: 'obj' })).toBe('obj')
    expect(toErrorMessage(null)).toBe('Something went wrong.')
    expect(toErrorMessage('')).toBe('Something went wrong.')
    expect(toErrorMessage(42)).toBe('42')
  })
})

describe('fail / ok', () => {
  it('builds ReplaceResult shapes', () => {
    expect(ok(['w'])).toEqual({ ok: true, warnings: ['w'] })
    expect(fail('x')).toEqual({ ok: false, error: 'x' })
    expect(fail('c', true)).toEqual({ ok: false, error: 'c', cancelled: true })
  })
})

describe('safeConfirm', () => {
  it('denies when confirm is omitted', async () => {
    const r = await safeConfirm(undefined, 'msg')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cancelled).toBe(true)
  })

  it('accepts true and cancels on false', async () => {
    expect((await safeConfirm(() => true, 'msg')).ok).toBe(true)
    const cancelled = await safeConfirm(() => false, 'msg')
    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) expect(cancelled.cancelled).toBe(true)
  })

  it('awaits async confirms', async () => {
    expect((await safeConfirm(async () => true, 'msg')).ok).toBe(true)
  })

  it('turns thrown confirms into non-cancelled failures', async () => {
    const r = await safeConfirm(() => {
      throw new Error('dialog blew up')
    }, 'msg')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.cancelled).toBeUndefined()
      expect(r.error).toMatch(/Confirmation failed: dialog blew up/)
    }
  })
})
