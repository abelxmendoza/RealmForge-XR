/**
 * Mock transcription provider — submit text as if AssemblyAI finalized it.
 * Exercises the same parser + executor path as live speech.
 */

import type { TranscriptResult } from './types'

export type MockTranscriptHandler = (result: TranscriptResult) => void

const handlers = new Set<MockTranscriptHandler>()

/** Register a controller to receive mock finals. Returns unsubscribe. */
export function addMockTranscriptHandler(handler: MockTranscriptHandler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** @deprecated Prefer addMockTranscriptHandler — kept for simple tests. */
export function setMockTranscriptHandler(next: MockTranscriptHandler | null): void {
  handlers.clear()
  if (next) handlers.add(next)
}

/**
 * Manually inject a final transcript (dev / demo / tests).
 * Delivers to all registered controllers.
 */
export function submitMockTranscript(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || handlers.size === 0) return false
  const result: TranscriptResult = { text: trimmed, isFinal: true }
  for (const h of handlers) h(result)
  return true
}

export function isMockProviderReady(): boolean {
  return handlers.size > 0
}
