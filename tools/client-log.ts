import fs from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Dev-only: headset errors → your terminal and `client-errors.log`.
 *
 * The Quest Browser's console is only reachable over USB debugging (chrome://inspect). src/devLog.ts
 * POSTs uncaught errors, rejections and console.error from the page to /__client-log; this prints them
 * in the dev server's terminal and appends them to client-errors.log (gitignored). Not part of builds.
 */
export function clientLog(file = 'client-errors.log'): Plugin {
  return {
    name: 'realmforge-client-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__client-log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let body = ''
        req.on('data', (chunk) => {
          if (body.length < 64_000) body += chunk
        })
        req.on('end', () => {
          const line = `[${new Date().toISOString()}] ${body}\n`
          fs.appendFile(file, line, () => {})
          server.config.logger.error(`[headset] ${body}`, { timestamp: true })
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}
