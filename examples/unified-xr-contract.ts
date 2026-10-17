/** Integration sketch for Emiliano. Render widgets in the existing menu architecture. */
import { worldActions } from '../src/world/actions'
import { getConfirmation, subscribeConfirmation, resolveConfirmation, confirmReplace, requestConfirmation } from '../src/world/confirmation'
import { getSharedVoiceController } from '../src/voice/voiceController'

export function connectXRMenu(ui: {
  showConfirmation: (request: ReturnType<typeof getConfirmation>) => void
  showVoice: (state: ReturnType<ReturnType<typeof getSharedVoiceController>['getState']>) => void
}) {
  const voice = getSharedVoiceController()
  voice.setConfirmHandler((r) => requestConfirmation({ type: r.action.type === 'DELETE_SELECTED' ? 'DELETE' : 'REPLACE_WORLD', message: r.message }))
  const removeConfirmation = subscribeConfirmation(() => ui.showConfirmation(getConfirmation()))
  const removeVoice = voice.subscribe(ui.showVoice)
  ui.showConfirmation(getConfirmation())
  return {
    environments: worldActions.listEnvironments(),
    loadEnvironment: (id: string) => worldActions.loadEnvironment(id, { confirmReplace }),
    loadSavedWorld: (id: string) => worldActions.loadSavedWorld(id, { confirmReplace }),
    setTool: worldActions.setTool,
    undo: worldActions.undo,
    redo: worldActions.redo,
    save: worldActions.quickSave,
    startListening: () => voice.startListening(),
    stopListening: () => voice.stopListening(),
    answer: resolveConfirmation,
    async disconnect() {
      removeConfirmation()
      removeVoice()
      await voice.stopListening()
    },
  }
}
