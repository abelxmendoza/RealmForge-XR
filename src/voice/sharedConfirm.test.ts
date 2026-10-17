import { afterEach, describe, expect, it } from 'vitest'
import { getConfirmation, resetConfirmationChannel, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import { voiceConfirm } from './sharedConfirm'

afterEach(() => {
  resetConfirmationChannel()
})

describe('voiceConfirm', () => {
  it('maps DELETE_SELECTED to DELETE confirmations', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = voiceConfirm({
      message: 'Delete selection?',
      action: { type: 'DELETE_SELECTED' },
    } as never)
    expect(getConfirmation()?.type).toBe('DELETE')
    resolveConfirmation(getConfirmation()!.id, true)
    await expect(pending).resolves.toBe(true)
    unsub()
  })

  it('maps other actions to REPLACE_WORLD', async () => {
    const unsub = subscribeConfirmation(() => {})
    const pending = voiceConfirm({
      message: 'Load Mars?',
      action: { type: 'LOAD_ENVIRONMENT', environmentId: 'mars-outpost' },
    } as never)
    expect(getConfirmation()?.type).toBe('REPLACE_WORLD')
    resolveConfirmation(getConfirmation()!.id, false)
    await expect(pending).resolves.toBe(false)
    unsub()
  })

  it('denies when no confirmation UI is mounted', async () => {
    await expect(
      voiceConfirm({
        message: 'Load?',
        action: { type: 'LOAD_ENVIRONMENT', environmentId: 'warehouse' },
      } as never),
    ).resolves.toBe(false)
  })
})
