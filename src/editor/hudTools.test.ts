import { describe, expect, it } from 'vitest'
import { BUILD_TOOLS, EDITOR_TOOLS, HUD_SECTIONS, PLAN_TOOLS, SCALE_LABELS } from './hudTools'

describe('HUD information architecture', () => {
  it('exposes the six primary sections in order', () => {
    expect(HUD_SECTIONS.map((s) => s.id)).toEqual(['build', 'edit', 'plan', 'simulate', 'view', 'save'])
  })

  it('keeps every tool shortcut unique and maps tools into Build / Edit / Plan only', () => {
    const keys = EDITOR_TOOLS.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(BUILD_TOOLS.every((t) => t.section === 'build')).toBe(true)
    expect(PLAN_TOOLS.map((t) => t.id).sort()).toEqual(['goal', 'robot'])
    expect(EDITOR_TOOLS.find((t) => t.id === 'select')?.section).toBe('edit')
  })

  it('uses friendly scale labels without changing preset ids', () => {
    expect(SCALE_LABELS.tabletop.label).toMatch(/Miniature/i)
    expect(SCALE_LABELS.life.short).toBe('1:1')
  })

  it('does not put shortcut letters in primary tool labels', () => {
    for (const tool of EDITOR_TOOLS) {
      expect(tool.label).not.toMatch(/^[0-9A-Z]\s/)
      expect(tool.tooltip).toContain(tool.key)
    }
  })
})
