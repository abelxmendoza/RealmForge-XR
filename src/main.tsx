import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './landing/LandingPage'
import { readEntry } from './landing/entry'
import { setupInstall } from './landing/install'
import { isStudioEntry } from './creative/entry'
import './landing/landing.css'

setupInstall()

const root = createRoot(document.getElementById('root')!)
const entry = readEntry(window.location.search)

if (new URLSearchParams(window.location.search).get('admin') === '1') {
  root.render(<div className="rf-loading" role="status"><p>Opening team & roles…</p></div>)
  void import('./auth/ui/AdminApp').then(({ default: AdminApp }) => {
    document.title = 'RealmForge XR — Team & roles'
    root.render(<StrictMode><AdminApp /></StrictMode>)
  }).catch((error: unknown) => {
    console.error('[RealmForge] Admin page failed to load', error)
    root.render(<div className="rf-loading" role="alert"><h1>Admin page couldn’t open.</h1><a href="?">Back to RealmForge XR</a></div>)
  })
} else if (isStudioEntry(window.location.search)) {
  root.render(<div className="rf-loading" role="status"><p>Opening Creative Studio…</p></div>)
  void import('./creative/ui/StudioApp').then(({ default: StudioApp }) => {
    document.title = 'RealmForge XR — Creative Studio'
    root.render(<StrictMode><StudioApp /></StrictMode>)
  }).catch((error: unknown) => {
    console.error('[RealmForge] Creative Studio failed to load', error)
    root.render(<div className="rf-loading" role="alert"><h1>Creative Studio couldn’t open.</h1><a href="?">Back to RealmForge XR</a></div>)
  })
} else if (entry.editor) {
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
