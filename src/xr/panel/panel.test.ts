import { describe, expect, it } from 'vitest'
import { fit, hitTest, layoutPanel, wrapText, type FontSpec, type PanelSpec } from './layout'
import { drawPanel, type Ctx } from './draw'
import { PressGate } from './pressGate'

/** ~Sora metrics: 0.56 em per character. */
const measure = (text: string, font: FontSpec) => text.length * font.size * 0.56

const spec: PanelSpec = {
  width: 560,
  cards: [
    {
      type: 'card',
      tone: 'brand',
      blocks: [
        {
          type: 'row',
          items: [
            { type: 'button', id: 'home', label: '← Home', width: 'auto' },
            { type: 'logo', size: 22 },
            { type: 'text', text: 'RealmForge XR', font: 'display', size: 18, weight: 800, flex: 1 },
            { type: 'button', id: 'exit', label: 'Exit VR', variant: 'primary', width: 'auto' },
          ],
        },
      ],
    },
    { type: 'card', blocks: [{ type: 'row', items: ['Build', 'Edit', 'Plan Routes'].map((l) => ({ type: 'button' as const, id: l, label: l, variant: 'tab' as const })) }] },
    {
      type: 'card',
      blocks: [{ type: 'grid', columns: 3, items: Array.from({ length: 7 }, (_, i) => ({ type: 'button' as const, id: `t${i}`, label: `Tool ${i}`, disabled: i === 6 })) }],
    },
  ],
}

describe('panel layout', () => {
  const layout = layoutPanel(spec, measure)

  it('keeps every control inside the panel and never overlapping another', () => {
    for (const h of layout.hits) {
      expect(h.rect.x).toBeGreaterThanOrEqual(0)
      expect(h.rect.y).toBeGreaterThanOrEqual(0)
      expect(h.rect.x + h.rect.w).toBeLessThanOrEqual(layout.width + 0.001)
      expect(h.rect.y + h.rect.h).toBeLessThanOrEqual(layout.height + 0.001)
    }
    for (const a of layout.hits)
      for (const b of layout.hits) {
        if (a === b) continue
        const overlap = a.rect.x < b.rect.x + b.rect.w && b.rect.x < a.rect.x + a.rect.w && a.rect.y < b.rect.y + b.rect.h && b.rect.y < a.rect.y + a.rect.h
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
      }
  })

  it('lays the tools out three to a row, like the HUD grid', () => {
    const t = (i: number) => layout.hits.find((h) => h.id === `t${i}`)!.rect
    expect(t(0).y).toBe(t(2).y)
    expect(t(3).y).toBeGreaterThan(t(0).y)
    expect(t(3).x).toBe(t(0).x)
  })

  it('hit-tests the control under a point, including disabled ones', () => {
    const exit = layout.hits.find((h) => h.id === 'exit')!.rect
    expect(hitTest(layout, exit.x + 2, exit.y + 2)?.id).toBe('exit')
    const t6 = layout.hits.find((h) => h.id === 't6')!
    expect(hitTest(layout, t6.rect.x + 1, t6.rect.y + 1)).toMatchObject({ id: 't6', disabled: true })
    expect(hitTest(layout, layout.width / 2, layout.height + 50)).toBeNull()
  })

  it('cuts labels that do not fit with an ellipsis', () => {
    const font = { size: 12, weight: 500, family: 'ui' as const }
    expect(fit('Short', 200, font, measure)).toBe('Short')
    const cut = fit('A very long label that will never fit', 80, font, measure)
    expect(cut.endsWith('…')).toBe(true)
    expect(measure(cut, font)).toBeLessThanOrEqual(80)
  })

  it('wraps text onto the allowed lines and marks the cut', () => {
    const font = { size: 10, weight: 500, family: 'ui' as const }
    expect(wrapText('one two three four', 1000, font, measure, 2)).toEqual(['one two three four'])
    const lines = wrapText('one two three four five six seven eight', 60, font, measure, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
  })
})

describe('panel painting', () => {
  it('paints every label without throwing', () => {
    const text: string[] = []
    const noop = () => undefined
    const gradient = { addColorStop: noop }
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : k === 'fillText' ? (s: string) => text.push(s) : k === 'createLinearGradient' ? () => gradient : k === 'measureText' ? () => ({ width: 10 }) : noop),
      set: (t, k, v) => ((t[k as string] = v), true),
    }) as unknown as Ctx
    drawPanel(ctx, layoutPanel(spec, measure), { hover: new Set(['exit']), pressed: 't0', held: false, logo: null }, 2)
    expect(text).toEqual(expect.arrayContaining(['← Home', 'RealmForge XR', 'Exit VR', 'Build', 'Tool 0']))
  })
})

describe('press gate', () => {
  it('fires once per touch: the pointer must lift before pressing again', () => {
    const g = new PressGate(300)
    expect(g.press(1, 1000)).toBe(true)
    expect(g.press(1, 2000)).toBe(false) // still down: a new page under the finger is not pressed
    g.release(1)
    expect(g.press(1, 2100)).toBe(true)
  })

  it('ignores a second pointer within the cooldown', () => {
    const g = new PressGate(300)
    expect(g.press(1, 1000)).toBe(true)
    expect(g.press(2, 1100)).toBe(false)
    g.release(2)
    expect(g.press(2, 1400)).toBe(true)
  })

  it('a touch on empty panel space must also lift first', () => {
    const g = new PressGate(300)
    g.hold(3)
    expect(g.press(3, 5000)).toBe(false)
    g.release(3)
    expect(g.press(3, 5001)).toBe(true)
  })
})
