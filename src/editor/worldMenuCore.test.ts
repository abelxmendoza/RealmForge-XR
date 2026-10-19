import { afterEach, describe, expect, it } from 'vitest'
import { isLibraryMenuBusy, resetLibraryMenuController } from './libraryMenuController'
import { isWorldsMenuBusy } from './worldsMenuController'
import { withBusy } from './worldMenuCore'

afterEach(() => resetLibraryMenuController())

describe('world menus share one busy guard', () => {
  it('blocks a library action while a Worlds-panel action is running (and the reverse)', async () => {
    let finish!: () => void
    const first = withBusy<string>('Load', () => new Promise((resolve) => (finish = () => resolve({ result: 'done', feedback: { kind: 'ok' as const, message: 'ok' } }))))
    expect(isWorldsMenuBusy()).toBe(true)
    expect(isLibraryMenuBusy()).toBe(true)
    const second = await withBusy<string>('Save', async () => ({ result: 'nope', feedback: { kind: 'ok' as const, message: 'ran' } }))
    expect(second.feedback).toMatchObject({ kind: 'error', message: expect.stringMatching(/already running/) })
    finish()
    expect((await first).feedback).toMatchObject({ kind: 'ok' })
    expect(isLibraryMenuBusy()).toBe(false)
  })

  it('turns a crash into an error result instead of throwing', async () => {
    const r = await withBusy('Import', async () => {
      throw new Error('disk full')
    })
    expect(r.feedback).toEqual({ kind: 'error', message: 'Import crashed: disk full' })
    expect(isWorldsMenuBusy()).toBe(false)
  })
})
