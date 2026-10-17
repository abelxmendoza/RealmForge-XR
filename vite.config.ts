import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
// xr-test/ is a standalone headset test page (docs/quest2-testing.md), built alongside the app.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        xrTest: 'xr-test/index.html',
      },
    },
  },
})
