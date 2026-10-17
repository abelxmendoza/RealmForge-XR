/**
 * React hook for desktop UI and Emiliano's XR menu.
 * Does not depend on HTML buttons — XR can call start/stop from any gesture.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  VoiceController,
  type VoiceControllerOptions,
  type VoiceControllerState,
} from './voiceController'
import type { ConfirmHandler } from './types'

export type UseVoiceCommandsOptions = VoiceControllerOptions & {
  /** Use a private controller instance instead of the shared singleton. */
  isolated?: boolean
}

export type VoiceCommandsApi = VoiceControllerState & {
  startListening: () => Promise<void>
  stopListening: () => Promise<void>
  setEnabled: (enabled: boolean) => void
  setConfirmHandler: (confirm: ConfirmHandler | undefined) => void
  /** Inject a final transcript (same as mock provider / tests). */
  submitTranscript: (text: string) => Promise<void>
  controller: VoiceController
}

function subscribeController(controller: VoiceController, onStoreChange: () => void): () => void {
  return controller.subscribe(() => onStoreChange())
}

/**
 * @example
 * const voice = useVoiceCommands({ provider: 'mock' })
 * // XR grip: voice.startListening() / voice.stopListening()
 */
export function useVoiceCommands(opts: UseVoiceCommandsOptions = {}): VoiceCommandsApi {
  const { isolated = false, ...controllerOpts } = opts
  const controllerRef = useRef<VoiceController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = isolated
      ? new VoiceController(controllerOpts)
      : new VoiceController(controllerOpts)
  }
  const controller = controllerRef.current

  // Keep confirm handler current without recreating the controller.
  useEffect(() => {
    controller.setConfirmHandler(controllerOpts.confirm)
  }, [controller, controllerOpts.confirm])

  const state = useSyncExternalStore(
    (onChange) => subscribeController(controller, onChange),
    () => controller.getState(),
    () => controller.getState(),
  )

  useEffect(() => {
    return () => {
      void controller.dispose()
      controllerRef.current = null
    }
  }, [controller])

  return {
    ...state,
    startListening: () => controller.startListening(),
    stopListening: () => controller.stopListening(),
    setEnabled: (enabled: boolean) => controller.setEnabled(enabled),
    setConfirmHandler: (confirm) => controller.setConfirmHandler(confirm),
    submitTranscript: async (text: string) => {
      await controller.submitTranscript(text)
    },
    controller,
  }
}

/**
 * Lightweight non-React accessor for XR systems that prefer an imperative API.
 */
export function createVoiceCommands(opts: VoiceControllerOptions = {}): VoiceController {
  return new VoiceController(opts)
}

/** Hook that only tracks listening flag — handy for HUD icons. */
export function useVoiceListening(controller: VoiceController): boolean {
  const [listening, setListening] = useState(controller.getState().isListening)
  useEffect(() => controller.subscribe((s) => setListening(s.isListening)), [controller])
  return listening
}
