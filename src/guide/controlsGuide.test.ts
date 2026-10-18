import { describe, expect, it } from 'vitest'
import { GUIDE_SECTIONS, getGuideSection, nextGuideSection, prevGuideSection } from './controlsGuide'
import { useGuide } from './guideStore'

describe('controls guide', () => {
  it('has short VR-friendly sections with titles and lines', () => {
    expect(GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(5)
    for (const section of GUIDE_SECTIONS) {
      expect(section.tab.length).toBeGreaterThan(0)
      expect(section.lines.length).toBeGreaterThan(2)
      expect(section.lines.every((line) => line.length <= 56)).toBe(true)
    }
  })

  it('tells users to scan with Scaniverse as a mesh and export GLB', () => {
    const text = getGuideSection('scans').lines.join(' ')
    expect(text).toContain('Scaniverse')
    expect(text).toContain('Mesh')
    expect(text).toContain('GLB')
  })

  it('cycles sections', () => {
    const first = GUIDE_SECTIONS[0]!.id
    const last = GUIDE_SECTIONS[GUIDE_SECTIONS.length - 1]!.id
    expect(nextGuideSection(last)).toBe(first)
    expect(prevGuideSection(first)).toBe(last)
    expect(getGuideSection('hands').id).toBe('hands')
  })

  it('opens and closes from the shared store', () => {
    useGuide.setState({ open: false, section: 'start' })
    useGuide.getState().openGuide('wrist')
    expect(useGuide.getState()).toMatchObject({ open: true, section: 'wrist' })
    useGuide.getState().closeGuide()
    expect(useGuide.getState().open).toBe(false)
  })
})
