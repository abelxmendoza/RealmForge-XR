import { describe, expect, it } from 'vitest'
import { layoutPanel, type FontSpec } from '../xr/panel/layout'
import { pokeStep, wristSpec } from './WristMenu'

describe('wrist menu fingertip presses', () => {
  it('presses once when the fingertip reaches the panel over a control', () => {
    expect(pokeStep(0.05, true, false)).toEqual({ down: false, pressed: false }) // hovering 5 cm away
    expect(pokeStep(0.008, true, false)).toEqual({ down: true, pressed: true }) // touching
    expect(pokeStep(-0.01, true, true)).toEqual({ down: true, pressed: false }) // pushed in: no repeat
  })

  it('needs the finger to back off before pressing again (hysteresis)', () => {
    expect(pokeStep(0.015, true, true)).toEqual({ down: true, pressed: false }) // still inside release zone
    expect(pokeStep(0.03, true, true)).toEqual({ down: false, pressed: false }) // backed off
    expect(pokeStep(0.006, true, false).pressed).toBe(true) // second press
  })

  it('ignores touches away from a control or far behind the panel', () => {
    expect(pokeStep(0, false, false).pressed).toBe(false)
    expect(pokeStep(-0.06, true, false).pressed).toBe(false)
  })
})

describe('wrist menu content', () => {
  const measure = (text: string, font: FontSpec) => text.length * font.size * 0.56
  const base = { rays: false, snap: true, occlusion: false, realSurfaces: false, paletteOpen: true, guideOpen: false, listening: false, group: 0, status: '1:60', worldScale: 'tabletop' as const }

  it('always offers the ways back: Menu, Hide all, Back, Home and Exit VR', () => {
    const ids = layoutPanel(wristSpec(base), measure).hits.map((h) => h.id)
    expect(ids).toEqual(expect.arrayContaining(['menu', 'hide-all', 'back', 'home', 'exit', 'mic', 'view:tabletop', 'view:enter']))
  })

  it('adds the framed-group row only when a group is framed', () => {
    expect(layoutPanel(wristSpec(base), measure).hits.some((h) => h.id === 'group:delete')).toBe(false)
    expect(layoutPanel(wristSpec({ ...base, group: 3 }), measure).hits.some((h) => h.id === 'group:delete')).toBe(true)
  })

  it('keeps every button at least a fingertip (12 mm) wide in the headset', () => {
    const layout = layoutPanel(wristSpec({ ...base, group: 2 }), measure)
    const mmPerPx = 200 / 300
    for (const h of layout.hits) expect(h.rect.w * mmPerPx, h.id).toBeGreaterThanOrEqual(12)
  })
})
