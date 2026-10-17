import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorld } from '../world/store'
import { useEnvironment } from '../world/environment'
import {
  environmentShortName,
  isEnvironmentLoadBusy,
  loadEnvironmentFromMenu,
  resetEnvironmentMenuController,
} from './environmentMenuController'

beforeEach(() => {
  resetEnvironmentMenuController()
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  useEnvironment.getState().setActive(null)
})

afterEach(() => {
  resetEnvironmentMenuController()
})

describe('environmentShortName', () => {
  it('maps known names and falls back safely', () => {
    expect(environmentShortName('Forge District')).toBe('Forge')
    expect(environmentShortName('Mars Outpost')).toBe('Mars')
    expect(environmentShortName('Autonomous Warehouse')).toBe('Warehouse')
    expect(environmentShortName('Custom Place')).toBe('Custom')
    expect(environmentShortName('   ')).toBe('Env')
  })
})

describe('loadEnvironmentFromMenu', () => {
  it('loads a valid environment and reports ready feedback', async () => {
    const { result, feedback } = await loadEnvironmentFromMenu('mars-outpost', {
      confirmReplace: () => true,
    })
    expect(result.ok).toBe(true)
    expect(feedback).toEqual({ kind: 'ready', id: 'mars-outpost' })
    expect(useEnvironment.getState().activeId).toBe('mars-outpost')
    expect(isEnvironmentLoadBusy()).toBe(false)
  })

  it('rejects unknown and empty ids without touching the world', async () => {
    const before = Object.keys(useWorld.getState().objects).length
    const unknown = await loadEnvironmentFromMenu('atlantis')
    expect(unknown.result.ok).toBe(false)
    expect(unknown.feedback.kind).toBe('error')
    const empty = await loadEnvironmentFromMenu('   ')
    expect(empty.feedback.kind).toBe('error')
    expect(Object.keys(useWorld.getState().objects).length).toBe(before)
  })

  it('reports cancelled when confirm returns false', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const { result, feedback } = await loadEnvironmentFromMenu('warehouse', { confirmReplace: () => false })
    expect(result.ok).toBe(false)
    expect(feedback.kind).toBe('cancelled')
  })

  it('surfaces thrown confirm handlers as errors', async () => {
    useWorld.getState().addObject({ kind: 'wall', position: [0, 0, 0], size: [1, 1, 0.3], rotationY: 0 })
    const { feedback } = await loadEnvironmentFromMenu('forge-district', {
      confirmReplace: () => {
        throw new Error('UI dialog crashed')
      },
    })
    expect(feedback.kind).toBe('error')
    if (feedback.kind === 'error') expect(feedback.message).toMatch(/UI dialog crashed/)
  })

  it('blocks overlapping loads', async () => {
    let release!: (v: { ok: true; warnings: string[] }) => void
    const gate = new Promise<{ ok: true; warnings: string[] }>((resolve) => {
      release = resolve
    })
    const first = loadEnvironmentFromMenu('mars-outpost', {
      load: async () => gate,
      confirmReplace: () => true,
    })
    // Allow first call to flip busy=true
    await Promise.resolve()
    expect(isEnvironmentLoadBusy()).toBe(true)
    const second = await loadEnvironmentFromMenu('warehouse', { confirmReplace: () => true })
    expect(second.feedback.kind).toBe('error')
    if (second.feedback.kind === 'error') expect(second.feedback.message).toMatch(/already loading/)
    release({ ok: true, warnings: [] })
    const done = await first
    expect(done.result.ok).toBe(true)
    expect(isEnvironmentLoadBusy()).toBe(false)
  })

  it('never throws when the injected loader crashes', async () => {
    const { feedback } = await loadEnvironmentFromMenu('warehouse', {
      load: async () => {
        throw new Error('boom')
      },
    })
    expect(feedback.kind).toBe('error')
    if (feedback.kind === 'error') expect(feedback.message).toMatch(/crashed: boom/)
    expect(isEnvironmentLoadBusy()).toBe(false)
  })
})
