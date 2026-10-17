import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startNavigation } from './nav/navigation'
import './style.css'

startNavigation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
