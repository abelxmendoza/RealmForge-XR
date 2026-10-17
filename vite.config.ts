import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { assemblyaiTokenPlugin } from './vite/assemblyaiTokenPlugin'
import { clientLog } from './tools/client-log'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
// assemblyaiTokenPlugin: GET /api/assemblyai/token (server-side ASSEMBLYAI_API_KEY only).
// clientLog: headset errors print in this terminal / client-errors.log.
// xr-test/: standalone headset test page, built alongside the app.
// proxy /mocap: Smartsuit bridge (optional; does not block the core demo).
export default defineConfig({
  plugins: [react(), basicSsl(), assemblyaiTokenPlugin(), clientLog()],
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
