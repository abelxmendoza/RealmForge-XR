/**
 * Vite middleware: POST /api/voice/plan
 *
 * Claude fallback for voice commands the keyword parser can't read (see tools/voice-plan.ts).
 * Uses the server-side ANTHROPIC_API_KEY (dotenvx / process.env); the key never reaches the browser.
 */

import type { Plugin } from 'vite'
import { handleVoicePlanRequest } from '../tools/voice-plan.ts'

export function voicePlanPlugin(): Plugin {
  return {
    name: 'realmforge-voice-plan',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleVoicePlanRequest(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleVoicePlanRequest(req, res, next)
      })
    },
  }
}
