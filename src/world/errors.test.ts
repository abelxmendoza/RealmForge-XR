import { describe, expect, it } from 'vitest'
import { describeStorageError, fail, failResult, failSave, guardAsync, guardSync, ok, safeConfirm, toErrorMessage } from './errors'

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

describe('fail / ok / failSave / failResult', () => {
  it('builds ReplaceResult shapes', () => {
    expect(ok(['w'])).toEqual({ ok: true, warnings: ['w'] })
    expect(fail('x')).toEqual({ ok: false, error: 'x' })
    expect(fail('c', true)).toEqual({ ok: false, error: 'c', cancelled: true })
  })

  it('builds SaveResult and Result failures', () => {
    expect(failSave('s', true)).toEqual({ ok: false, error: 's', cancelled: true })
    expect(failResult('r')).toEqual({ ok: false, error: 'r' })
  })
})

describe('describeStorageError', () => {
  it('maps quota errors to stable copy', () => {
    expect(describeStorageError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toMatch(/storage is full/i)
    expect(describeStorageError(Object.assign(new Error('x'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }))).toMatch(/storage is full/i)
    expect(describeStorageError(new Error('disk'))).toMatch(/Browser storage error: disk/)
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

describe('guardAsync / guardSync', () => {
  it('passes through successful Result values', async () => {
    expect(await guardAsync(async () => ({ ok: true as const, value: 1 }))).toEqual({ ok: true, value: 1 })
    expect(guardSync(() => ({ ok: true as const }))).toEqual({ ok: true })
  })

  it('converts thrown errors into failures', async () => {
    const asyncFail = await guardAsync(async () => {
      throw new Error('async boom')
    }, 'Op')
    expect(asyncFail).toEqual({ ok: false, error: 'Op: async boom' })

    const syncFail = guardSync(() => {
      throw new Error('sync boom')
    }, 'Sync')
    expect(syncFail).toEqual({ ok: false, error: 'Sync: sync boom' })
  })
})
