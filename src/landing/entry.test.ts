import { describe, expect, it } from 'vitest'
import { editorHref, workflowHref, LANDING_TEMPLATES, LANDING_VENUES, LANDING_WORLDS, readEntry } from './entry'

describe('landing page editor entry', () => {
  it('shows the landing page by default', () => {
    expect(readEntry('')).toEqual({ editor: false })
    expect(readEntry('?world=warehouse').editor).toBe(false)
  })
  it.each(LANDING_TEMPLATES)('launches the actual $name template', (world) => {
    expect(readEntry(editorHref(world.id))).toEqual({ editor: true, world: world.id })
  })
  it('exposes event venues alongside the original worlds', () => {
    expect(LANDING_WORLDS.map((w) => w.id)).toEqual(['forge-district', 'mars-outpost', 'warehouse', 'factory-floor'])
    expect(LANDING_VENUES.map((v) => v.id)).toEqual(['empty-event-venue', 'job-fair', 'music-festival'])
    expect(LANDING_TEMPLATES).toHaveLength(7)
  })
  it('starts the hero picker with Empty Space', () => {
    expect(LANDING_TEMPLATES[0]).toMatchObject({ id: 'empty-event-venue', name: 'Empty Space', number: '01' })
    expect(LANDING_TEMPLATES.map((t) => t.id)).toEqual([
      'empty-event-venue',
      'job-fair',
      'music-festival',
      'forge-district',
      'mars-outpost',
      'warehouse',
      'factory-floor',
    ])
    // Numbered in picker order.
    expect(LANDING_TEMPLATES.map((t) => t.number)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
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


describe('build / real-world scan entry workflows', () => {
  it.each(['build', 'scan'] as const)('opens the %s workflow directly', (workflow) => {
    expect(readEntry(workflowHref(workflow))).toEqual({ editor: true, workflow })
  })
  it('ignores workflow flags outside the editor and rejects unsupported workflows', () => {
    expect(readEntry('?workflow=scan')).toEqual({ editor: false })
    expect(readEntry('?editor=1&workflow=unknown')).toEqual({ editor: true })
  })
  it('gives explicit templates precedence over a workflow', () => {
    expect(readEntry('?editor=1&workflow=scan&world=warehouse')).toEqual({ editor: true, world: 'warehouse' })
  })
})
