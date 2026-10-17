import { afterEach, describe, expect, it } from 'vitest'
import {
  confirmReplace,
  getConfirmation,
  requestConfirmation,
  resetConfirmationChannel,
  resolveConfirmation,
  subscribeConfirmation,
} from './confirmation'

afterEach(() => {
  resetConfirmationChannel()
})

describe('confirmation channel', () => {
  it('denies when no UI consumer is subscribed', async () => {
    await expect(requestConfirmation({ type: 'REPLACE_WORLD', message: 'Load?' })).resolves.toBe(false)
    expect(getConfirmation()).toBeNull()
  })

  it('denies empty messages', async () => {
    const unsub = subscribeConfirmation(() => {})
    await expect(requestConfirmation({ type: 'DELETE', message: '   ' })).resolves.toBe(false)
    unsub()
  })

  it('queues one request and resolves accept/reject', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = requestConfirmation({ type: 'REPLACE_WORLD', message: 'Replace?' })
    const req = getConfirmation()
    expect(req?.message).toBe('Replace?')
    resolveConfirmation(req!.id, true)
    await expect(pending).resolves.toBe(true)
    expect(getConfirmation()).toBeNull()
    unsub()
  })

  it('rejects overlapping requests while one is pending', async () => {
    const unsub = subscribeConfirmation(() => {})
    const first = requestConfirmation({ type: 'REPLACE_WORLD', message: 'First' })
    await expect(requestConfirmation({ type: 'REPLACE_WORLD', message: 'Second' })).resolves.toBe(false)
    resolveConfirmation(getConfirmation()!.id, false)
    await expect(first).resolves.toBe(false)
    unsub()
  })

  it('auto-cancels pending when the last consumer unsubscribes', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = requestConfirmation({ type: 'DELETE', message: 'Delete?' })
    expect(getConfirmation()).not.toBeNull()
    unsub()
    await expect(pending).resolves.toBe(false)
    expect(getConfirmation()).toBeNull()
  })

  it('ignores resolveConfirmation for stale ids', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = requestConfirmation({ type: 'OVERWRITE_SAVE', message: 'Overwrite?' })
    const id = getConfirmation()!.id
    resolveConfirmation(id + 99, true)
    expect(getConfirmation()?.id).toBe(id)
    resolveConfirmation(id, true)
    await expect(pending).resolves.toBe(true)
    unsub()
  })

  it('confirmReplace uses REPLACE_WORLD type', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = confirmReplace('Swap worlds?')
    expect(getConfirmation()?.type).toBe('REPLACE_WORLD')
    resolveConfirmation(getConfirmation()!.id, true)
    await expect(pending).resolves.toBe(true)
    unsub()
  })

  it('survives a throwing subscriber notify', async () => {
    const unsub = subscribeConfirmation(() => {
      throw new Error('bad listener')
    })
    await expect(requestConfirmation({ type: 'REPLACE_WORLD', message: 'Hi' })).resolves.toBe(false)
    expect(getConfirmation()).toBeNull()
    unsub()
  })
})
