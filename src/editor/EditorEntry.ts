import App from '../App'
import { startNavigation } from '../nav/navigation'
import { installHistory } from '../world/history'
import { installDirtyTracking } from '../world/persistence'
import { loadEnvironment } from '../world/environment'
import { startMocapClient } from '../mocap/client'
import { installDevLog } from '../devLog'
import { installLineRaycastGuard } from '../scene/lineRaycastGuard'
import type { LandingWorldId } from '../landing/entry'
import { loadAssetManifest } from '../world/assetManifest'
import '../style.css'

/** Runs once before mounting the editor; a landing selection initializes a fresh scene. */
export async function initializeEditor(world?: LandingWorldId) {
  installDevLog()
  installLineRaycastGuard()
  // Custom library assets first, so saved/loaded worlds keep their asset ids.
  await loadAssetManifest()
  if (world) {
    // The requested template replaces only the boot-time starter, before editing is possible.
    const result = await loadEnvironment(world, { confirmReplace: () => true })
    if (!result.ok) throw new Error(result.error)
  }
  startNavigation()
  installHistory()
  installDirtyTracking()
  startMocapClient()
}
export default App
