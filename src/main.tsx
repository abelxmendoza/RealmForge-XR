import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './landing/LandingPage'
import { readEntry } from './landing/entry'
import { setupInstall } from './landing/install'
import './landing/landing.css'

setupInstall()

const root = createRoot(document.getElementById('root')!)
const entry = readEntry(window.location.search)

if (entry.editor) {
  root.render(<div className="rf-loading" role="status"><p>Opening your world…</p></div>)
  void import('./editor/EditorEntry').then(async ({ default: App, initializeEditor }) => {
    await initializeEditor(entry.world)
    document.title = 'RealmForge XR — World editor'
    root.render(<StrictMode><App /></StrictMode>)
  }).catch((error: unknown) => {
    console.error('[RealmForge] Editor startup failed', error)
    root.render(<div className="rf-loading" role="alert"><h1>Your world couldn’t open.</h1><p>Try reloading the editor or return to the project page.</p><a href="?editor=1">Retry editor</a><a href="?">Back to RealmForge XR</a></div>)
  })
} else {
  root.render(<StrictMode><LandingPage /></StrictMode>)
}
