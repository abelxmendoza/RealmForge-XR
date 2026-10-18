import { describe, expect, it } from 'vitest'
import { resolveInspectorContext, TOOL_PANEL_HEADINGS } from './inspectorContext'

describe('resolveInspectorContext', () => {
  it('routes simulate and save sections first', () => {
    expect(
      resolveInspectorContext({ section: 'simulate', tool: 'building', hasObject: true, hasActor: false }),
    ).toBe('simulate')
    expect(resolveInspectorContext({ section: 'save', tool: 'wall', hasObject: false, hasActor: true })).toBe('save')
  })

  it('prefers selected object over tool', () => {
    expect(
      resolveInspectorContext({ section: 'build', tool: 'building', hasObject: true, hasActor: false }),
    ).toBe('object')
  })

  it('shows catalog tools even while an object is selected', () => {
    for (const tool of ['actor', 'asset', 'event'] as const) {
      expect(resolveInspectorContext({ section: 'build', tool, hasObject: true, hasActor: false })).toBe(tool)
    }
  })

  it('prefers selected actor when no object', () => {
    expect(
      resolveInspectorContext({ section: 'plan', tool: 'actor', hasObject: false, hasActor: true }),
    ).toBe('actor')
  })

  it('falls back to active tool', () => {
    for (const tool of Object.keys(TOOL_PANEL_HEADINGS) as (keyof typeof TOOL_PANEL_HEADINGS)[]) {
      expect(
        resolveInspectorContext({ section: 'build', tool, hasObject: false, hasActor: false }),
      ).toBe(tool)
    }
  })
})
