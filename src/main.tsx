import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startNavigation } from './nav/navigation'
import { startMocapClient } from './mocap/client'
import { installDevLog } from './devLog'
import { installLineRaycastGuard } from './scene/lineRaycastGuard'
import './style.css'

installDevLog()
installLineRaycastGuard()
startNavigation()
startMocapClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
