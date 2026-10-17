import { describe, expect, it } from 'vitest'
import { editorHref, LANDING_WORLDS, readEntry } from './entry'

describe('landing page editor entry', () => {
  it('shows the landing page by default', () => {
    expect(readEntry('')).toEqual({ editor: false })
    expect(readEntry('?world=warehouse').editor).toBe(false)
  })
  it.each(LANDING_WORLDS)('launches the actual $name template', (world) => {
    expect(readEntry(editorHref(world.id))).toEqual({ editor: true, world: world.id })
  })
  it('opens the editor without a template and ignores unknown template input', () => {
    expect(readEntry(editorHref())).toEqual({ editor: true })
    expect(readEntry('?editor=1&world=unknown')).toEqual({ editor: true })
    expect(readEntry('?editor=1&world=__proto__')).toEqual({ editor: true })
  })
  it('does not load the editor on a malformed entry flag', () => {
    expect(readEntry('?editor=false').editor).toBe(false)
  })
})
