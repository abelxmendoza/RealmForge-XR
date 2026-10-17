/**
 * Rokoko Smartsuit Pro → browser bridge.
 *
 * Rokoko Studio streams live frames as UDP JSON (Livestream → Custom, JSON v3). Browsers can't read UDP,
 * so this relays every frame to WebSocket clients. The Vite dev server proxies `/mocap` here, so the
 * headset connects to `wss://<dev server or tunnel>/mocap` with no extra setup.
 *
 *   npm run mocap:bridge   # listen for Rokoko Studio on UDP 14043
 *   npm run mocap:mock     # no suit: send a synthetic walking skeleton
 *
 * Env: MOCAP_UDP_PORT (default 14043), MOCAP_WS_PORT (default 14044).
 * Runs with Node's built-in TypeScript support (Node 22.18+ / 24); no build step.
 */
import dgram from 'node:dgram'
import { WebSocket, WebSocketServer } from 'ws'
import { mockFrame } from '../src/mocap/mock.ts'

const UDP_PORT = Number(process.env.MOCAP_UDP_PORT ?? 14043)
const WS_PORT = Number(process.env.MOCAP_WS_PORT ?? 14044)
const MOCK = process.argv.includes('--mock')

const wss = new WebSocketServer({ port: WS_PORT, path: '/mocap' })
let frames = 0
let warnedBinary = false

function broadcast(text: string) {
  frames++
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(text)
}

wss.on('connection', (socket, req) => {
  console.log(`[mocap] client connected (${req.socket.remoteAddress}); ${wss.clients.size} total`)
  socket.on('close', () => console.log(`[mocap] client left; ${wss.clients.size} total`))
})
wss.on('listening', () => console.log(`[mocap] WebSocket on ws://localhost:${WS_PORT}/mocap (Vite proxies /mocap here)`))

if (MOCK) {
  const t0 = performance.now()
  setInterval(() => broadcast(JSON.stringify(mockFrame((performance.now() - t0) / 1000))), 1000 / 60)
  console.log('[mocap] MOCK mode: sending a synthetic walking skeleton at 60 fps')
} else {
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  udp.on('message', (msg) => {
    // JSON v3 starts with "{". Anything else is usually Studio's compressed stream.
    if (msg[0] !== 0x7b) {
      if (!warnedBinary) {
        console.warn('[mocap] received non-JSON data: in Rokoko Studio choose "JSON v3" and turn compression off')
        warnedBinary = true
      }
      return
    }
    broadcast(msg.toString('utf8'))
  })
  udp.on('error', (err) => {
    console.error(`[mocap] UDP error: ${err.message}`)
    process.exit(1)
  })
  udp.bind(UDP_PORT, () => console.log(`[mocap] waiting for Rokoko Studio on UDP ${UDP_PORT} (Livestream → Custom → JSON v3)`))
}

setInterval(() => {
  if (frames) console.log(`[mocap] ${(frames / 5).toFixed(0)} fps → ${wss.clients.size} client(s)`)
  frames = 0
}, 5000)
