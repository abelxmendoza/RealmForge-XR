import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { assemblyaiTokenPlugin } from './vite/assemblyaiTokenPlugin'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
// assemblyaiTokenPlugin serves GET /api/assemblyai/token (server-side ASSEMBLYAI_API_KEY only).
export default defineConfig({
  plugins: [react(), basicSsl(), assemblyaiTokenPlugin()],
  server: { host: true, allowedHosts: ['.trycloudflare.com'] },
  build: { rollupOptions: { input: { main: 'index.html', xrTest: 'xr-test/index.html' } } },
})
