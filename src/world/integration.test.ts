import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { worldActions } from './actions'
import { clearHistory, installHistory, withHistorySuppressed } from './history'
import { getConfirmation, requestConfirmation, resolveConfirmation, subscribeConfirmation } from './confirmation'
import { useWorld } from './store'
import { robotRuntime, startNavigation, useNav } from '../nav/navigation'
import { groundPoint, worldRootRef } from '../scene/worldRoot'
import { usePlacement } from '../xr/placement'
import { VoiceController } from '../voice/voiceController'

beforeEach(() => {
  startNavigation()
  installHistory()
  withHistorySuppressed(() => useWorld.getState().loadWorld({ objects: [], robotStart: [-8, 8], goal: [8, -8] }))
  clearHistory()
})
afterEach(() => { worldRootRef.current = null; usePlacement.getState().resetToDefault() })

describe('unified interaction integration', () => {
  it('denies confirmation without a UI and rejects stale responses', async () => {
    expect(await requestConfirmation({ type: 'DELETE', message: 'Delete?' })).toBe(false)
    const unsub = subscribeConfirmation(() => {})
    const accepted = requestConfirmation({ type: 'REPLACE_WORLD', message: 'Replace?' })
    const request = getConfirmation()!
    resolveConfirmation(request.id + 1, true)
    expect(getConfirmation()).toBe(request)
    resolveConfirmation(request.id, false)
    expect(await accepted).toBe(false)
    const abandoned = requestConfirmation({ type: 'DELETE', message: 'Delete?' })
    unsub()
    expect(await abandoned).toBe(false)
  })

  it('voice replacement waits for the shared confirmation UI', async () => {
    worldActions.createObject({ kind: 'wall', position: [0, 0, 0], size: [2, 2, 1], rotationY: 0 })
    const before = useWorld.getState().objects
    const unsub = subscribeConfirmation(() => {})
    const c = new VoiceController({ provider: 'mock', confirm: (r) => requestConfirmation({ type: 'REPLACE_WORLD', message: r.message }) })
    const result = c.submitTranscript('Load Mars Outpost')
    expect(useWorld.getState().objects).toBe(before)
    resolveConfirmation(getConfirmation()!.id, true)
    expect((await result)?.status).toBe('executed')
    expect(useNav.getState().status).toBe('moving')
    unsub()
    await c.dispose()
  })

  it.each(['forge-district', 'mars-outpost', 'warehouse'])('edits and replans after loading %s', async (id) => {
    expect((await worldActions.loadEnvironment(id)).ok).toBe(true)
    expect(useNav.getState().path.length).toBeGreaterThan(1)
    const object = Object.values(useWorld.getState().objects).find((o) => o.kind === 'building')!
    const before = useNav.getState().replanCount
    worldActions.updateObject(object.id, { rotationY: object.rotationY + 0.2 })
    expect(useNav.getState().replanCount).toBeGreaterThan(before)
    expect(worldActions.undo()).toBe(true)
    expect(useWorld.getState().objects[object.id].rotationY).toBe(object.rotationY)
    expect(worldActions.redo()).toBe(true)
  })

  it('undoing an obstacle edit preserves the live robot pose', () => {
    const id = worldActions.createObject({ kind: 'wall', position: [3, 0, 0], size: [1, 1, 1], rotationY: 0 })
    robotRuntime.pos = [-5, 6]
    worldActions.updateObject(id, { rotationY: 0.3 })
    worldActions.undo()
    expect(robotRuntime.pos).toEqual([-5, 6])
  })

  it('placement and scale leave object coordinates and robot paths local', () => {
    const root = new THREE.Group()
    const placement = new THREE.Group()
    placement.position.set(2, 1, -3)
    placement.rotation.y = 0.6
    root.scale.setScalar(0.07)
    placement.add(root)
    worldRootRef.current = root
    placement.updateMatrixWorld(true)
    const state = useWorld.getState()
    const path = useNav.getState().path
    const point = root.localToWorld(new THREE.Vector3(3, 0, -2))
    const local = groundPoint({ point })!
    expect(local[0]).toBeCloseTo(3)
    expect(local[1]).toBeCloseTo(-2)
    usePlacement.getState().pinAt([2, 1, -3], [0, 0, 0, 1], 'table', null)
    expect(useWorld.getState()).toBe(state)
    expect(useNav.getState().path).toBe(path)
  })

  it('keeps controller snapshots stable between updates', async () => {
    const c = new VoiceController({ provider: 'mock' })
    expect(c.getState()).toBe(c.getState())
    const initial = c.getState()
    await c.startListening()
    expect(c.getState()).not.toBe(initial)
    await c.dispose()
  })
})

describe('environment persistence metadata', () => {
  it('round-trips the saved appearance alongside editable objects', async () => {
    const { exportWorld, importWorld } = await import('./persistence')
    const { useEnvironment } = await import('./environment')
    await worldActions.loadEnvironment('mars-outpost')
    const exported = exportWorld('Mars edited').json
    expect(JSON.parse(exported).environmentId).toBe('mars-outpost')
    await worldActions.loadEnvironment('warehouse', { confirmReplace: () => true })
    expect((await importWorld(exported, { confirmReplace: () => true })).ok).toBe(true)
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(useEnvironment.getState().appearance.groundColor).toBe('#c47a4a')
  })
})
