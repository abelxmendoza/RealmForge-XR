import { requestConfirmation } from '../world/confirmation'
import type { ConfirmationRequest } from './types'

/**
 * Voice confirmations go through the shared confirmation channel, so the desktop dialog
 * and the VR control palette both show them. One handler for every voice button.
 */
export const voiceConfirm = (request: ConfirmationRequest) =>
  requestConfirmation({
    type: request.action.type === 'DELETE_SELECTED' ? 'DELETE' : 'REPLACE_WORLD',
    message: request.message,
  })

/** Options every voice button uses, so they all share one live AssemblyAI controller. */
export const VOICE_OPTIONS = { provider: 'assemblyai', fallbackToMock: false, confirm: voiceConfirm } as const
