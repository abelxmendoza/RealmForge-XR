/**
 * Vite middleware: GET /api/assemblyai/token
 *
 * Issues a short-lived AssemblyAI streaming token using the server-side
 * ASSEMBLYAI_API_KEY (from dotenvx / process.env). Never exposes the permanent key
 * to browser bundles — do not use VITE_ASSEMBLYAI_API_KEY.
 *
 * Also active during `vite preview`. For static hosting outside Vite, run
 * `npm run token:serve` (see tools/token-server.ts) or any host that serves
 * the same route using tools/assemblyai-token.ts.
 */

import type { Plugin } from 'vite'
import { handleAssemblyAiTokenRequest } from '../tools/assemblyai-token'

export function assemblyaiTokenPlugin(): Plugin {
  return {
    name: 'realmforge-assemblyai-token',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleAssemblyAiTokenRequest(req, res, next)
      })
    },
    // Same route for `vite preview` / laptop demos against a built dist.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleAssemblyAiTokenRequest(req, res, next)
      })
    },
  }
}
