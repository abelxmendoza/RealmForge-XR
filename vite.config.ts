import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { assemblyaiTokenPlugin } from './vite/assemblyaiTokenPlugin'
import { clientLog } from './tools/client-log'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
// xr-test/ is a standalone headset test page (docs/quest2-testing.md), built alongside the app.
// assemblyaiTokenPlugin serves GET /api/assemblyai/token (server-side ASSEMBLYAI_API_KEY only).
// clientLog: dev-only, headset errors print in this terminal and go to client-errors.log.
export default defineConfig({
  plugins: [react(), basicSsl(), assemblyaiTokenPlugin(), clientLog()],
  // allowedHosts: lets a `cloudflared tunnel` URL reach the dev server when the headset can't see the laptop on LAN.
  // proxy /mocap: the Smartsuit bridge (tools/mocap-bridge.ts), so the headset reaches it on the same origin.
  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/mocap': { target: 'ws://localhost:14044', ws: true } },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        xrTest: 'xr-test/index.html',
      },
    },
  },
})
