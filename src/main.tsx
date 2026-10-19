import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './landing/LandingPage'
import { readEntry } from './landing/entry'
import { setupInstall } from './landing/install'
import { XR_TEST_HOOKS } from './testHooks'
import './theme/fonts'
import './landing/landing.css'

setupInstall()

const root = createRoot(document.getElementById('root')!)
const entry = readEntry(window.location.search)

/**
 * `?iwer` swaps in Meta's WebXR emulator (a simulated Quest 3 with controllers), so the XR UI can be
 * driven from a desktop browser and by the e2e tests (`npm run test:xr`). Dev and e2e builds only.
 */
async function installXREmulator() {
  if (!XR_TEST_HOOKS || !new URLSearchParams(window.location.search).has('iwer')) return
  const { XRDevice, metaQuest3 } = await import('iwer')
  const device = new XRDevice(metaQuest3)
  device.installRuntime({ polyfillLayers: false, forceInstall: true })
  // Handles for e2e/xr.e2e.mjs: aim at panel buttons, read state, run voice commands without a mic.
  const [{ controlWorldPoint, panelCenter, panelRegistry, pressLog }, paletteUI, { useGuide }, { useWorld }, { useRoutePlan }, { parseVoiceCommand }, { executeVoiceCommand }, { voiceConfirm }] =
    await Promise.all([
      import('./xr/panel/registry'),
      import('./xr/paletteUI'),
      import('./guide/guideStore'),
      import('./world/store'),
      import('./nav/routePlan'),
      import('./voice/commandParser'),
      import('./voice/commandExecutor'),
      import('./voice/sharedConfirm'),
    ])
  const voice = async (text: string) => {
    const parsed = parseVoiceCommand(text)
    return parsed.ok ? executeVoiceCommand(parsed.command, { confirm: voiceConfirm }) : { status: 'unsupported' }
  }
  Object.assign(window, { __xrDevice: device, __rf: { controlWorldPoint, panelCenter, panelRegistry, pressLog, paletteUI, useGuide, useWorld, useRoutePlan, voice } })
}

if (entry.editor) {
  root.render(<div className="rf-loading" role="status"><p>Opening your world…</p></div>)
  void installXREmulator()
    .then(() => import('./editor/EditorEntry')).then(async ({ default: App, initializeEditor }) => {
    await initializeEditor(entry.world, entry.workflow)
    document.title = 'RealmForge XR — World editor'
    root.render(<StrictMode><App /></StrictMode>)
  }).catch((error: unknown) => {
    console.error('[RealmForge] Editor startup failed', error)
    root.render(<div className="rf-loading" role="alert"><h1>Your world couldn’t open.</h1><p>Try reloading the editor or return to the project page.</p><a href="?editor=1">Retry editor</a><a href="?">Back to RealmForge XR</a></div>)
  })
} else {
  root.render(<StrictMode><LandingPage /></StrictMode>)
}
