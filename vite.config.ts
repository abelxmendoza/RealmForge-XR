import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
// xr-test/ is a standalone headset test page (docs/quest2-testing.md), built alongside the app.
export default defineConfig({
  plugins: [react(), basicSsl()],
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
