/**
 * Vite middleware: /api/creative/* for the Creative Studio (?studio=1). DEV SERVER ONLY, deliberately
 * not mounted on `vite preview` or any deployment: the library is local, personal and holds the
 * ProjectSim spend path. Loopback clients only; see tools/creative/http.ts.
 */
import type { Plugin } from 'vite'
import { creativeHandler } from '../tools/creative/http.ts'

export function creativeStudioPlugin(): Plugin {
  return {
    name: 'realmforge-creative-studio',
    apply: 'serve',
    configureServer(server) {
      const handle = creativeHandler()
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next)
      })
    },
  }
}
