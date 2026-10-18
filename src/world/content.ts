import { useScan } from '../scan/store'
import { useWorld } from './store'

/** What replacing the world would throw away: objects, actors and an imported scan (counted as one item). */
export function worldContentCount(): number {
  const { objects, actors } = useWorld.getState()
  return Object.keys(objects).length + Object.keys(actors).length + useScan.getState().scans.length
}
