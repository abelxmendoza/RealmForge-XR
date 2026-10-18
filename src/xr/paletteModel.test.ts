import { describe, expect, it } from 'vitest'
import { TOOLBAR_SECTIONS } from '../editor/toolbar'
import { layoutPanel, type FontSpec } from './panel/layout'
import { PALETTE_TABS, buildPalette, hudSectionOf, sectionOf, type PaletteSnapshot } from './paletteModel'
import { errorPanelSpec } from './XRErrorBoundary'
import { guideSpec } from './ControlsGuidePanel'
import { GUIDE_SECTIONS } from '../guide/controlsGuide'
import type { PalettePage } from './paletteUI'

const measure = (text: string, font: FontSpec) => text.length * font.size * 0.56

const base: PaletteSnapshot = {
  page: 'build',
  canBack: false,
  collapsed: false,
  tool: 'select',
  selected: null,
  snap: true,
  rays: false,
  surface: 'real',
  worldScale: 'tabletop',
  occlusion: false,
  realSurfaces: false,
  gestures: true,
  mocap: { enabled: false, status: 'off' },
  placing: false,
  inAR: false,
  nav: { status: 'moving', replans: 1 },
  route: { waypoints: 0, playState: 'idle', label: 'No waypoints' },
  flowDraft: false,
  destinations: Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, label: 'Charging pad' })),
  attendee: { running: false, paused: false, phase: 'idle' },
  saves: Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, label: `My world ${i + 1}` })),
  templates: [{ id: 'blank', name: 'Blank' }, { id: 'mars-outpost', name: 'Mars Outpost' }],
  assets: Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, name: `Asset ${i}` })),
  assetId: 'a0',
  assetRotationDeg: 0,
  events: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, label: `Event ${i}` })),
  eventId: 'e0',
  actorKind: 'worker',
  actor: null,
  brush: { buildingStyle: 'office', wallMaterial: 'concrete', platformMaterial: 'asphalt', roof: 'flat', decor: 'tree', treeStyle: 'round' },
  history: { canUndo: true, canRedo: false },
  guideOpen: false,
  voice: { listening: false, partial: '' },
  message: 'Ready.',
  confirm: null,
  busy: false,
  offsets: {},
  scan: { name: 'Ground floor scan', level: 'Ground floor', floorY: 0, visible: true, opacity: 1, cutHeight: null },
  scanStatus: 'ready',
  measuring: false,
  measurePoints: 0,
  scanDistance: 1,
}

const PAGES: PalettePage[] = ['build', 'edit', 'plan', 'simulate', 'view', 'save', 'assets', 'events', 'actors', 'actor-settings', 'brush', 'saved', 'styles', 'room', 'scans', 'scan-align', 'scan-display', 'scan-measure']

describe('VR palette model', () => {
  it.each(PAGES)('%s: every control fits the panel, has an action and none overlap', (page) => {
    const model = buildPalette({ ...base, page, canBack: !['build', 'edit', 'plan', 'simulate', 'view', 'save'].includes(page) })
    const layout = layoutPanel(model.spec, measure)
    for (const h of layout.hits) {
      expect(h.rect.x + h.rect.w, h.id).toBeLessThanOrEqual(layout.width + 0.01)
      expect(model.actions[h.id] ?? (h.handle ? () => {} : undefined), `${h.id} has no action`).toBeTypeOf('function')
    }
    const ids = layout.hits.map((h) => h.id)
    expect(new Set(ids).size, `duplicate ids on ${page}: ${ids}`).toBe(ids.length)
  })

  it('shows the desktop HUD sections with the same labels plus the VR Edit tab, the current one lit', () => {
    const layout = layoutPanel(buildPalette({ ...base, page: 'plan' }).spec, measure)
    const tabs = layout.nodes.filter((n) => n.kind === 'button' && n.item.id.startsWith('section:'))
    expect(tabs.map((n) => n.kind === 'button' && n.item.label)).toEqual(PALETTE_TABS.map((s) => s.label))
    expect(PALETTE_TABS.filter((t) => t.id !== 'edit').map((t) => t.label)).toEqual(TOOLBAR_SECTIONS.map((s) => s.label))
    // The desktop has no Edit section: leaving VR on Edit shows Build.
    expect(hudSectionOf('edit')).toBe('build')
    expect(tabs.find((n) => n.kind === 'button' && n.item.id === 'section:plan')).toMatchObject({ item: { variant: 'on' } })
  })

  it('sub-pages get Back and light their parent tab', () => {
    const model = buildPalette({ ...base, page: 'assets', canBack: true })
    expect(model.spec.cards.flatMap((c) => c.blocks).some((b) => b.type === 'row' && b.items.some((i) => i.type === 'button' && i.id === 'back'))).toBe(true)
    expect(sectionOf('assets')).toBe('build')
    expect(sectionOf('saved')).toBe('save')
    expect(sectionOf('room')).toBe('view')
  })

  it('always has Home, Exit VR, Collapse and Close, even collapsed', () => {
    for (const collapsed of [false, true]) {
      const ids = layoutPanel(buildPalette({ ...base, collapsed }).spec, measure).hits.map((h) => h.id)
      expect(ids).toEqual(expect.arrayContaining(['home', 'exit', 'collapse', 'close']))
      if (collapsed) expect(ids.some((id) => id.startsWith('section:'))).toBe(false)
    }
  })

  it('a pending confirmation replaces the page with Cancel / Confirm, even when collapsed', () => {
    const ids = layoutPanel(buildPalette({ ...base, collapsed: true, confirm: { id: 7, message: 'Replace this world?' } }).spec, measure).hits.map((h) => h.id)
    expect(ids).toEqual(expect.arrayContaining(['confirm:no', 'confirm:yes']))
    expect(ids.some((id) => id.startsWith('tool:'))).toBe(false)
  })

  it('pages long lists and disables edits without a selection', () => {
    const assets = layoutPanel(buildPalette({ ...base, page: 'assets', canBack: true }).spec, measure).hits
    expect(assets.filter((h) => h.id.startsWith('asset:'))).toHaveLength(6)
    expect(assets.find((h) => h.id === 'assets:prev')?.disabled).toBe(true)
    expect(assets.find((h) => h.id === 'assets:next')?.disabled).toBe(false)
    const edit = layoutPanel(buildPalette({ ...base, page: 'edit' }).spec, measure).hits
    expect(edit.find((h) => h.id === 'edit:delete')?.disabled).toBe(true)
    expect(edit.find((h) => h.id === 'tool:select')?.disabled).toBe(false)
  })

  it('busy disables the page buttons but keeps the ways out', () => {
    const hits = layoutPanel(buildPalette({ ...base, busy: true }).spec, measure).hits
    expect(hits.find((h) => h.id === 'tool:wall')?.disabled).toBe(true)
    expect(hits.find((h) => h.id === 'exit')?.disabled).toBe(false)
    expect(hits.find((h) => h.id === 'close')?.disabled).toBe(false)
  })
})

describe('property scans in VR', () => {
  it('Build links to Property scans, and scan pages light the Build tab', () => {
    const ids = layoutPanel(buildPalette(base).spec, measure).hits.map((h) => h.id)
    expect(ids).toContain('page:scans')
    expect(sectionOf('scan-measure')).toBe('build')
  })

  it('without a scan only Files is usable; Apply needs two measured points', () => {
    const none = layoutPanel(buildPalette({ ...base, page: 'scans', canBack: true, scan: null, scanStatus: 'none' }).spec, measure).hits
    expect(none.find((h) => h.id === 'scan:files')?.disabled).toBe(false)
    expect(none.find((h) => h.id === 'scan:next')?.disabled).toBe(true)
    const measuring = (n: number) => layoutPanel(buildPalette({ ...base, page: 'scan-measure', canBack: true, measuring: true, measurePoints: n }).spec, measure).hits
    expect(measuring(1).find((h) => h.id === 'scan:apply')?.disabled).toBe(true)
    expect(measuring(2).find((h) => h.id === 'scan:apply')?.disabled).toBe(false)
  })
})

describe('XR guide panel', () => {
  it('shows every guide tab with its full label', () => {
    const nodes = layoutPanel(guideSpec('start', false), measure).nodes
    const tabs = nodes.filter((n) => n.kind === 'button' && n.item.id.startsWith('section:'))
    expect(tabs).toHaveLength(GUIDE_SECTIONS.length)
    for (const t of tabs) if (t.kind === 'button') expect(t.label, t.item.id).toBe(t.item.label)
  })
})

describe('XR error fallback', () => {
  it('offers Try again, Exit VR and Reload', () => {
    const ids = layoutPanel(errorPanelSpec('control palette', 'boom'), measure).hits.map((h) => h.id)
    expect(ids).toEqual(['retry', 'exit', 'reload'])
  })
})
