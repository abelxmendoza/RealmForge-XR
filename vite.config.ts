import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS + host:true so the Quest browser can open the dev server over LAN (WebXR needs a secure context).
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: { host: true },
})
