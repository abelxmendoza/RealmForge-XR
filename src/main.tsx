import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startNavigation } from './nav/navigation'
import { installHistory } from './world/history'
import { installDirtyTracking } from './world/persistence'
import './style.css'

startNavigation()
installHistory()
installDirtyTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
