import { parseRokokoFrame } from './rokoko'
import { mocapFrame, useMocap } from './store'

/**
 * WebSocket client for the Smartsuit bridge. Same origin by default (`wss://<host>/mocap`, proxied by
 * Vite to tools/mocap-bridge.ts), so it works over LAN and through the tunnel. Override with
 * VITE_MOCAP_URL (e.g. via dotenvx) to point at another machine.
 */
export function mocapUrl(): string {
  const override = import.meta.env.VITE_MOCAP_URL as string | undefined
  if (override) return override
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/mocap`
}

/** No frame for this long while connected: treat the stream as stalled. */
const STALE_MS = 2000

let socket: WebSocket | null = null
let retry: ReturnType<typeof setTimeout> | null = null
let backoff = 500
let count = 0

function connect() {
  const { set } = useMocap.getState()
  set({ status: 'connecting', error: undefined })
  const ws = new WebSocket(mocapUrl())
  socket = ws
  ws.onopen = () => {
    backoff = 500
  }
  ws.onmessage = (e) => {
    const frame = typeof e.data === 'string' ? parseRokokoFrame(e.data) : null
    if (!frame) return
    mocapFrame.current = frame
    mocapFrame.receivedAt = performance.now()
    count++
    const s = useMocap.getState()
    if (s.status !== 'live' || s.actors !== frame.actors.length) s.set({ status: 'live', actors: frame.actors.length })
  }
  ws.onerror = () => useMocap.getState().set({ status: 'error', error: `Can't reach ${mocapUrl()} (is npm run mocap:bridge running?)` })
  ws.onclose = () => {
    if (socket !== ws) return
    socket = null
    if (!useMocap.getState().enabled) return
    retry = setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 8000)
  }
}

function disconnect() {
  if (retry) clearTimeout(retry)
  retry = null
  const ws = socket
  socket = null
  ws?.close()
  mocapFrame.current = null
  useMocap.getState().set({ status: 'off', fps: 0, actors: 0, error: undefined })
}

/** Connect while `enabled` is on; also reports fps and stalls once a second. Call once at startup. */
export function startMocapClient() {
  useMocap.subscribe((s, prev) => {
    if (s.enabled === prev.enabled) return
    if (s.enabled) connect()
    else disconnect()
  })
  setInterval(() => {
    const s = useMocap.getState()
    if (!s.enabled) return
    const stale = s.status === 'live' && performance.now() - mocapFrame.receivedAt > STALE_MS
    s.set({ fps: count, ...(stale ? { status: 'connecting' as const } : {}) })
    count = 0
  }, 1000)
}
