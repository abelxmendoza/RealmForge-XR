import { sendActorToDestination } from '../actors/actions'
import { useWorld } from './store'
import { useEditor } from '../editor/settings'
import { buildAsset, canPlaceAsset, getAsset } from './assets'
import { buildGrid, isBlocked, worldToCell } from '../nav/grid'
import { navObstacles, type Vec2 } from './types'
import { planPath } from '../nav/astar'
import { robotRuntime, startNavigation } from '../nav/navigation'
import { setImmediateDestination } from '../nav/routePlan'
import { isAssetId } from './assetTypes'

export function selectCatalogAsset(id: string): boolean {
  if (!isAssetId(id)) return false
  useEditor.getState().set({ assetId: id })
  useWorld.getState().setTool('asset')
  return true
}
export function rotateCatalogAsset(direction: 1 | -1 = 1) {
  const state = useEditor.getState()
  state.set({ assetRotation: (state.assetRotation + direction * Math.PI / 2) % (Math.PI * 2) })
}
export function previewCatalogAsset(at: Vec2) {
  const { assetId, assetRotation, snap } = useEditor.getState()
  const object = buildAsset(assetId, at, assetRotation, snap)
  return object ? { object, valid: canPlaceAsset(object, Object.values(useWorld.getState().objects)) } : null
}
export function placeCatalogAsset(at: Vec2): { ok: true; id: string } | { ok: false; error: string } {
  const preview = previewCatalogAsset(at)
  if (!preview) return { ok: false, error: 'Choose a valid catalog object and placement.' }
  if (!preview.valid) return { ok: false, error: 'Placement overlaps a solid object. Choose a clear area.' }
  const world = useWorld.getState()
  const id = world.addObject(preview.object)
  world.select(id)
  return { ok: true, id }
}
export function listDestinations() {
  return Object.values(useWorld.getState().objects).filter((object) => object.destinationRole).map((object) => ({
    id: object.id, name: getAsset(object.assetId || '')?.name || object.destinationRole!, role: object.destinationRole!, point: [object.position[0], object.position[2]] as Vec2,
  }))
}
/** Target the marker's current local center; no hidden cargo or battery simulation. */
export function sendRobotToDestination(id: string): { ok: true } | { ok: false; error: string } {
  const world = useWorld.getState()
  if (world.selectedActorId) return sendActorToDestination(world.selectedActorId, id)
  const object = world.objects[id]
  if (!object?.destinationRole) return { ok: false, error: 'That destination no longer exists.' }
  const goal: Vec2 = [object.position[0], object.position[2]]
  const grid = buildGrid(navObstacles(world.objects))
  const cell = worldToCell(grid, goal)
  if (isBlocked(grid, ...cell)) return { ok: false, error: 'Destination is obstructed. Move the marker or obstacle.' }
  startNavigation()
  if (!planPath(grid, robotRuntime.pos, goal)) return { ok: false, error: 'No route to this destination.' }
  setImmediateDestination(goal)
  return { ok: true }
}
