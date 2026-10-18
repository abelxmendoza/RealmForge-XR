import { describe, expect, it } from 'vitest'
import { TOOLBAR_SECTIONS, TOOLBAR_TOOLS, toolByKey, SCALE_LABELS } from './toolbar'

describe('toolbar information architecture', () => {
  it('exposes exactly six primary sections', () => {
    expect(TOOLBAR_SECTIONS.map((s) => s.id)).toEqual(['build', 'edit', 'plan', 'simulate', 'view', 'save'])
    expect(TOOLBAR_SECTIONS.every((s) => s.label.length > 0 && s.hint.length > 0)).toBe(true)
  })

  it('keeps digit shortcuts 1–0 for every tool without putting them in labels', () => {
    const keys = TOOLBAR_TOOLS.map((t) => t.key)
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'])
    for (const t of TOOLBAR_TOOLS) {
      expect(t.label).not.toMatch(/^\d/)
      expect(t.tooltip).toContain(`(${t.key})`)
      expect(toolByKey(t.key)?.id).toBe(t.id)
    }
  })

  it('uses friendly scale names', () => {
    expect(SCALE_LABELS.tabletop).toContain('Miniature')
    expect(SCALE_LABELS.life).toContain('Life Size')
  })
})
