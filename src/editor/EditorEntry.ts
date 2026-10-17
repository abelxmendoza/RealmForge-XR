import { installAutosave } from '../world/autosave'
import { useWorld } from '../world/store'
import { startActors } from '../actors/runtime'
import App from '../App'
import { startNavigation } from '../nav/navigation'
import { installHistory } from '../world/history'
import { installDirtyTracking } from '../world/persistence'
import { loadEnvironment } from '../world/environment'
import { startMocapClient } from '../mocap/client'
import { installDevLog } from '../devLog'
import { installLineRaycastGuard } from '../scene/lineRaycastGuard'
import type { LandingWorldId } from '../landing/entry'
import { openWorldLibrary } from './WorldLibrary'
import '../style.css'

/** Runs once before mounting the editor; a landing selection initializes a fresh scene. */
export async function initializeEditor(world?: LandingWorldId) {
  installDevLog()
  installLineRaycastGuard()
  if (world) {
    // The requested template replaces only the boot-time starter, before editing is possible.
    const result = await loadEnvironment(world, { confirmReplace: () => true })
    if (!result.ok) throw new Error(result.error)
  } else {
    // No world picked on the landing page: let the user choose one before they start.
    openWorldLibrary()
  }
  if (!world) useWorld.getState().loadWorld({ objects: [], actors: [], robotEnabled: false, robotStart: [0, 0], goal: null })
  startNavigation()
  startActors()
  installHistory()
  installDirtyTracking()
  installAutosave()
  startMocapClient()
}
export default App
