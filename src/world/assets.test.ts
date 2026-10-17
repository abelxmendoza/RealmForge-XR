import { beforeEach, describe, expect, it } from 'vitest'
import { ASSETS, buildAsset, canPlaceAsset, footprintsOverlap } from './assets'
import { useWorld, idFor } from './store'
import { useEditor } from '../editor/settings'
import { worldActions } from './actions'
import { installHistory, clearHistory, undo, redo } from './history'
import { parseWorld, serializeWorld } from './serialize'
import { blocksNavigation, navObstacles, WORLD } from './types'
import { useNav, startNavigation } from '../nav/navigation'
import { buildGrid } from '../nav/grid'
import { planPath } from '../nav/astar'
import { warehouse } from './presets'
import { exportWorld, importWorld, loadSavedWorld, saveWorld, useWorldLibrary } from './persistence'

beforeEach(() => {
  useWorld.getState().loadWorld({ objects: [], robotStart: [-8, 8], goal: null })
  useEditor.getState().set({ assetId: 'storage-rack', assetRotation: 0, snap: true })
  installHistory()
  startNavigation()
  clearHistory()
})

describe('warehouse catalog and placement', () => {
  it.each(ASSETS)('creates independent $name objects with correct collision policy', (asset) => {
    const a = buildAsset(asset.id, [0, 0])!
    const b = buildAsset(asset.id, [1, 1])!
    expect(a.assetId).toBe(asset.id)
    expect(a.size).not.toBe(b.size)
    expect(blocksNavigation({ ...a, id: 'test' })).toBe(asset.solid)
    expect(a.destinationRole).toBe(asset.destinationRole)
  })
  it('rotates and clamps the whole footprint inside world bounds', () => {
    const object = buildAsset('storage-rack', [WORLD.half, WORLD.half], Math.PI / 2)!
    expect(object.position[0]).toBeCloseTo(WORLD.half - 0.75)
    expect(object.position[2]).toBeCloseTo(WORLD.half - 2)
  })
  it('rejects invalid input without modifying the editor', () => {
    expect(buildAsset('unknown', [0, 0])).toBeNull()
    expect(buildAsset('cargo', [NaN, 0])).toBeNull()
    expect(worldActions.selectCatalogAsset('unknown')).toBe(false)
    expect(useWorld.getState().objects).toEqual({})
  })
  it('uses the preview transform when committing and supports undo/redo', () => {
    worldActions.selectCatalogAsset('conveyor')
    worldActions.rotateCatalogAsset()
    const preview = worldActions.previewCatalogAsset([2.3, 3.4])!
    const result = worldActions.placeCatalogAsset([2.3, 3.4])
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(useWorld.getState().objects[result.id]).toEqual({ ...preview.object, id: result.id })
    expect(undo()).toBe(true)
    expect(useWorld.getState().objects[result.id]).toBeUndefined()
    expect(redo()).toBe(true)
    expect(useWorld.getState().objects[result.id].assetId).toBe('conveyor')
  })
  it('rejects overlapping solid objects but allows a walkable bay over a road', () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [3, 2, 1], rotationY: 0.4 })
    expect(worldActions.previewCatalogAsset([0, 0])?.valid).toBe(false)
    expect(worldActions.placeCatalogAsset([0, 0]).ok).toBe(false)
    const bay = buildAsset('loading-bay', [8, 8])!
    expect(canPlaceAsset(bay, [{ id: 'road', kind: 'platform', position: [8, 0, 8], size: [10, 0.1, 10], rotationY: 0 }])).toBe(true)
  })
  it('detects rotated footprints and permits touching edges', () => {
    const a = { position: [0, 0, 0] as [number, number, number], size: [4, 2, 1] as [number, number, number], rotationY: Math.PI / 4 }
    expect(footprintsOverlap(a, { ...a, position: [1, 0, 0] })).toBe(true)
    expect(footprintsOverlap(a, { ...a, position: [10, 0, 10] })).toBe(false)
    expect(footprintsOverlap({ ...a, rotationY: 0 }, { ...a, rotationY: 0, position: [4, 0, 0] })).toBe(false)
  })
  it('keeps catalog identity and destination roles through serialization and duplication', () => {
    worldActions.selectCatalogAsset('charging-pad')
    const placed = worldActions.placeCatalogAsset([0, 0])
    if (!placed.ok) throw new Error(placed.error)
    const duplicate = worldActions.duplicateObject(placed.id)!
    expect(useWorld.getState().objects[duplicate].destinationRole).toBe('charging')
    const result = parseWorld(serializeWorld(useWorld.getState(), 'Facility'), idFor)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.world.objects.every((o) => o.assetId === 'charging-pad' && o.destinationRole === 'charging' && o.solid === false)).toBe(true)
  })
  it('repairs unknown optional metadata while accepting older worlds', () => {
    const object = { ...buildAsset('cargo', [0, 0])!, id: 'cargo-a' }
    const file = serializeWorld({ objects: [object], robotStart: [0, 5], goal: null }, 'Old world')
    const result = parseWorld({ ...file, objects: [{ ...object, assetId: 'unknown', destinationRole: 'teleport' }] }, idFor)
    expect(result.ok).toBe(true)
    if (result.ok) { expect(result.world.objects[0].assetId).toBeUndefined(); expect(result.world.objects[0].destinationRole).toBeUndefined(); expect(result.warnings).toHaveLength(2) }
    expect(parseWorld({ ...file, objects: [{ ...object, assetId: undefined, destinationRole: undefined }] }, idFor).ok).toBe(true)
  })
})

describe('functional destinations and warehouse preset', () => {
  it('includes every catalog asset and navigable destinations in the warehouse', () => {
    const world = warehouse()
    const grid = buildGrid(navObstacles(world.objects))
    expect(new Set(world.objects.map((o) => o.assetId).filter(Boolean)).size).toBe(ASSETS.length)
    expect(planPath(grid, world.robotStart, world.goal!)).not.toBeNull()
    for (const marker of world.objects.filter((o) => o.destinationRole)) {
      expect(planPath(grid, world.robotStart, [marker.position[0], marker.position[2]])).not.toBeNull()
    }
  })
  it('dispatches the robot to a marker at its current edited coordinates', () => {
    const object = buildAsset('pickup-zone', [0, 0])!
    const id = useWorld.getState().addObject(object)
    worldActions.updateObject(id, { position: [3, 0, -3] })
    expect(worldActions.sendRobotToDestination(id).ok).toBe(true)
    expect(useWorld.getState().goal).toEqual([3, -3])
    expect(useNav.getState().status).toBe('moving')
    expect(worldActions.listDestinations()[0].point).toEqual([3, -3])
  })
  it('rejects removed or obstructed destinations without changing the current goal', () => {
    const id = useWorld.getState().addObject(buildAsset('inspection-point', [0, 0])!)
    useWorld.getState().addObject({ kind: 'building', position: [0, 0, 0], size: [4, 4, 4], rotationY: 0 })
    expect(worldActions.sendRobotToDestination(id).ok).toBe(false)
    expect(useWorld.getState().goal).toBeNull()
    worldActions.deleteObject(id)
    expect(worldActions.sendRobotToDestination(id).ok).toBe(false)
  })
  it('replans when a placed catalog obstacle moves into the route', () => {
    const marker = useWorld.getState().addObject(buildAsset('delivery-zone', [8, -8])!)
    expect(worldActions.sendRobotToDestination(marker).ok).toBe(true)
    const barrier = useWorld.getState().addObject(buildAsset('barrier', [15, 15])!)
    const before = useNav.getState().replanCount
    worldActions.updateObject(barrier, { position: [0, 0, 0], rotationY: Math.PI / 4 })
    expect(useNav.getState().replanCount).toBeGreaterThan(before)
    expect(useNav.getState().path.length).toBeGreaterThan(1)
  })
  it('saves, reloads and imports catalog objects without losing their roles', async () => {
    const data = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } })
    useWorldLibrary.setState({ worlds: [], activeId: null, activeName: 'Facility', dirty: false })
    const facility = warehouse()
    const expectedAssets = facility.objects.filter((o) => o.assetId)
    useWorld.getState().loadWorld(facility)
    const saved = saveWorld('Facility')
    if (!saved.ok) throw new Error(saved.error)
    const exported = exportWorld().json
    useWorld.getState().loadWorld({ objects: [], robotStart: [0, 5], goal: null })
    expect((await loadSavedWorld(saved.value.id, { confirmReplace: () => true })).ok).toBe(true)
    expect(worldActions.listDestinations()).toHaveLength(5)
    expect((await importWorld(exported, { confirmReplace: () => true })).ok).toBe(true)
    expect(Object.values(useWorld.getState().objects).filter((o) => o.assetId)).toEqual(expectedAssets)
  })
})
