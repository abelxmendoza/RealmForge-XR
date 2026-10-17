/**
 * Dev-only remote error log (see tools/client-log.ts): sends uncaught errors, promise rejections and
 * console.error calls to the dev server, so problems on the headset show up on the PC without USB
 * debugging. Stripped from production builds.
 */
export function installDevLog() {
  if (!import.meta.env.DEV) return
  let sent = 0
  const send = (kind: string, detail: string) => {
    if (sent++ > 200) return // don't flood the terminal if something errors every frame
    const body = JSON.stringify({ kind, detail: detail.slice(0, 8000), xr: !!document.querySelector('canvas'), ua: navigator.userAgent.slice(0, 120) })
    fetch('/__client-log', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
  }
  const describe = (v: unknown) => (v instanceof Error ? `${v.message}\n${v.stack ?? ''}` : typeof v === 'string' ? v : JSON.stringify(v))

  window.addEventListener('error', (e) => send('error', `${e.message}\n${e.error?.stack ?? `${e.filename}:${e.lineno}`}`))
  window.addEventListener('unhandledrejection', (e) => send('rejection', describe(e.reason)))
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    send('console.error', args.map(describe).join(' '))
    original(...args)
  }
  send('info', 'dev log connected')
}
