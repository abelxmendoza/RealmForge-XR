/**
 * RealmForge XR — AssemblyAI voice command subsystem (Agent 4).
 *
 * Pipeline: mic → AssemblyAI STT → parser → executor → worldActions
 * Mock path: submitMockTranscript / submitTranscript → same parser + executor
 */

export type {
  VoiceCommand,
  ParseResult,
  ConfirmationRequest,
  ConfirmHandler,
  VoiceEvent,
  VoiceEventListener,
  TranscriptResult,
} from './types'

export { parseVoiceCommand, normalizeTranscript } from './commandParser'
export { executeVoiceCommand, type ExecuteResult, type CommandExecutorOptions } from './commandExecutor'
export { subscribeVoiceEvents, emitVoiceEvent } from './events'
export {
  VoiceController,
  getSharedVoiceController,
  disposeSharedVoiceController,
  type VoiceControllerState,
  type VoiceControllerOptions,
  type VoiceProviderMode,
} from './voiceController'
export { useVoiceCommands, createVoiceCommands, useVoiceListening, type VoiceCommandsApi } from './useVoiceCommands'
export {
  submitMockTranscript,
  isMockProviderReady,
  setMockTranscriptHandler,
  addMockTranscriptHandler,
} from './mockProvider'
export { startAssemblyAISession, type AssemblyAISession, type AssemblyAIClientOptions } from './assemblyAIClient'
export { isWebSpeechAvailable, startWebSpeechSession, type WebSpeechSession } from './webSpeechClient'
export { LinearResampler, float32ToPcm16 } from './pcmResampler'
