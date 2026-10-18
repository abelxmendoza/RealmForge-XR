/**
 * What the in-VR Control Palette shows and does, as data: a PanelSpec laid out like the desktop HUD
 * (title card, section tabs, tool grid, status, footer) plus an action per control id.
 *
 * `buildPalette` is a pure function of a snapshot, so every page is unit-tested without a headset;
 * `readPaletteSnapshot` gathers that snapshot from the live stores. ControlPalette.tsx only renders it.
 */
import { create } from 'zustand'
import { ACTOR_CATALOG, ACTOR_KINDS, type ActorKind } from '../actors/types'
import { getActorRuntime } from '../actors/runtime'
import { blockRoute } from '../editor/demo'
import { deleteSelected } from '../editor/deleteObjects'
import { useEditor } from '../editor/settings'
import { TOOLBAR_SECTIONS, TOOLBAR_TOOLS, SCALE_SHORT, type ToolbarSection } from '../editor/toolbar'
import { togglePlaceCity, toggleRays, toggleSurface } from '../editor/xrInput'
import { flowActions } from '../flow/actions'
import { useFlow } from '../flow/store'
import { useGuide } from '../guide/guideStore'
import { toggleMocap, useMocap } from '../mocap/store'
import { useNav } from '../nav/navigation'
import {
  clearRoute,
  pauseRoute,
  playRoute,
  removeLastWaypoint,
  routeStatusLabel,
  skipToNextWaypoint,
  stopRoute,
  useRoutePlan,
} from '../nav/routePlan'
import { SCALE_IDS, type ScaleId } from '../scene/worldRoot'
import { pauseAttendeeSimulation, resetAttendeeSimulation, resumeAttendeeSimulation, startAttendeeSimulation, useAttendee } from '../sim/attendee'
import { worldActions } from '../world/actions'
import { libraryAssets } from '../world/assetLibrary'
import { getAsset } from '../world/assets'
import { BUILDING_STYLE_IDS, PLATFORM_MATERIALS, TREE_STYLES, WALL_MATERIALS } from '../world/catalog'
import { requestConfirmation, resolveConfirmation } from '../world/confirmation'
import { EVENT_CATALOG } from '../world/eventCatalog'
import { getHistoryState } from '../world/history'
import { listTemplates } from '../world/library'
import { useWorldLibrary } from '../world/persistence'
import { useWorld, type Tool } from '../world/store'
import type { WorldObject } from '../world/types'
import { executeVoiceCommand } from '../voice/commandExecutor'
import { voiceConfirm } from '../voice/sharedConfirm'
import type { ButtonItem, Card, Item, PanelSpec } from './panel/layout'
import { toggleOcclusion } from './occlusion'
import { createPaletteWorld, editPaletteSelection, loadPaletteSave, savePaletteWorld } from './paletteActions'
import { PAGE_TITLE, backPage, closePalette, currentPage, isSection, openPage, setPaletteHidden, usePaletteUI, type PalettePage } from './paletteUI'
import { usePlacement } from './placement'
import { toggleRealSurfaces } from './realSurfaces'
import { scanRoom } from './roomTracker'
import { exitXR } from './session'
import { readSpatial } from './spatialSave'

export const PALETTE_WIDTH = 560
const PER_PAGE = 9

/** Paging offset per list page (catalog, events, saves, destinations). */
export const usePaletteOffsets = create<Record<string, number>>(() => ({}))
const setOffset = (key: string, value: number) => usePaletteOffsets.setState({ [key]: Math.max(0, value) })

export interface PaletteSnapshot {
  page: PalettePage
  canBack: boolean
  collapsed: boolean
  tool: Tool
  selected: WorldObject | null
  snap: boolean
  rays: boolean
  surface: 'real' | 'virtual'
  worldScale: ScaleId
  occlusion: boolean
  realSurfaces: boolean
  gestures: boolean
  mocap: { enabled: boolean; status: string }
  placing: boolean
  inAR: boolean
  nav: { status: string; replans: number }
  route: { waypoints: number; playState: string; label: string }
  flowDraft: boolean
  destinations: { id: string; label: string }[]
  attendee: { running: boolean; paused: boolean; phase: string }
  saves: { id: string; label: string }[]
  templates: { id: string; name: string }[]
  assets: { id: string; name: string }[]
  assetId: string
  assetRotationDeg: number
  events: { id: string; label: string }[]
  eventId: string
  actorKind: ActorKind
  actor: { id: string; name: string; status: string } | null
  brush: { buildingStyle: string; wallMaterial: string; platformMaterial: string; roof: string; decor: string; treeStyle: string }
  history: { canUndo: boolean; canRedo: boolean }
  guideOpen: boolean
  voice: { listening: boolean; partial: string }
  message: string
  confirm: { id: number; message: string } | null
  busy: boolean
  offsets: Record<string, number>
}

export interface PaletteModel {
  spec: PanelSpec
  actions: Record<string, () => unknown>
}

const btn = (id: string, label: string, extra: Partial<ButtonItem> = {}): ButtonItem => ({ type: 'button', id, label, ...extra })
const on = (active: boolean): Partial<ButtonItem> => (active ? { variant: 'on' } : {})

/** Labels mirror the desktop HUD's (TOOLBAR_TOOLS), so both say the same thing. */
const toolLabel = (id: Tool) => TOOLBAR_TOOLS.find((t) => t.id === id)?.label ?? id

/** One page of a long list, plus Previous / More buttons when it doesn't fit. */
function paged<T>(s: PaletteSnapshot, key: string, list: T[], per: number) {
  const pages = Math.max(1, Math.ceil(list.length / per))
  const offset = Math.min(s.offsets[key] ?? 0, pages - 1)
  return {
    items: list.slice(offset * per, offset * per + per),
    start: offset * per,
    nav: pages > 1 ? [btn(`${key}:prev`, '‹ Previous', { disabled: offset === 0 }), btn(`${key}:next`, 'More ›', { disabled: offset >= pages - 1 })] : [],
    actions: { [`${key}:prev`]: () => setOffset(key, offset - 1), [`${key}:next`]: () => setOffset(key, offset + 1) } as Record<string, () => unknown>,
  }
}

/** The page's buttons (3-column grid, like the HUD's tool grid) and what each does. */
function pageContent(s: PaletteSnapshot): { items: ButtonItem[]; actions: Record<string, () => unknown> } {
  const items: ButtonItem[] = []
  const actions: Record<string, () => unknown> = {}
  const add = (b: ButtonItem, run: () => unknown) => {
    items.push(b)
    actions[b.id] = run
  }
  const needs = !s.selected
  const ed = useEditor.getState

  switch (s.page) {
    case 'build': {
      for (const id of ['wall', 'building', 'platform', 'decor'] as const) add(btn(`tool:${id}`, toolLabel(id), on(s.tool === id)), () => worldActions.setTool(id))
      add(btn('page:assets', 'Object catalog ›', on(s.tool === 'asset')), () => openPage('assets'))
      add(btn('page:events', 'Event objects ›', on(s.tool === 'event')), () => openPage('events'))
      add(btn('page:actors', 'Actors ›', on(s.tool === 'actor')), () => openPage('actors'))
      add(btn('page:brush', 'Materials ›'), () => openPage('brush'))
      add(btn('snap', s.snap ? 'Align to Grid · On' : 'Align to Grid', on(s.snap)), () => ed().set({ snap: !s.snap }))
      break
    }
    case 'edit': {
      add(btn('tool:select', 'Select', on(s.tool === 'select')), () => worldActions.setTool('select'))
      const edits = [
        ['rotate-left', 'Rotate left'],
        ['rotate-right', 'Rotate right'],
        ['grow', 'Wider'],
        ['shrink', 'Narrower'],
        ['raise', 'Taller'],
        ['lower', 'Shorter'],
        ['style', s.selected?.assetId ? 'Cycle color' : 'Material / style'],
        ['roof', 'Toggle roof'],
        ['duplicate', 'Duplicate'],
      ] as const
      for (const [action, label] of edits)
        add(btn(`edit:${action}`, label, { disabled: needs || (action === 'roof' && (!!s.selected?.assetId || s.selected?.kind !== 'building')) }), () => editPaletteSelection(action))
      add(btn('edit:delete', 'Delete', { variant: 'danger', disabled: needs }), () => deleteSelected())
      break
    }
    case 'plan': {
      add(btn('tool:goal', toolLabel('goal'), on(s.tool === 'goal')), () => worldActions.setTool('goal'))
      add(btn('tool:route', toolLabel('route'), on(s.tool === 'route' || s.flowDraft)), () => flowActions.beginRoute('waypoint'))
      add(btn('tool:robot', toolLabel('robot'), on(s.tool === 'robot')), () => worldActions.setTool('robot'))
      if (s.flowDraft) add(btn('flow:finish', 'Finish Flow Route', { variant: 'primary' }), () => flowActions.finishRoute())
      const active = s.route.playState === 'playing' || s.route.playState === 'paused'
      if (s.route.playState === 'playing') add(btn('route:pause', 'Pause'), () => pauseRoute())
      else add(btn('route:play', s.route.playState === 'paused' ? 'Resume' : 'Play Route', { disabled: !s.route.waypoints }), () => playRoute())
      add(btn('route:stop', 'Stop', { disabled: !active }), () => stopRoute())
      add(btn('route:next', 'Next Stop', { disabled: !active }), () => skipToNextWaypoint())
      add(btn('route:undo', 'Remove Last', { disabled: !s.route.waypoints || active }), () => removeLastWaypoint())
      add(btn('route:clear', 'Clear Route', { variant: 'danger', disabled: !s.route.waypoints }), () => clearRoute())
      add(btn('route:block', 'Block Path'), blockRoute)
      const dest = paged(s, 'dest', s.destinations, 3)
      dest.items.forEach((d, i) => add(btn(`dest:${d.id}`, `Go: ${d.label} ${dest.start + i + 1}`), () => worldActions.sendRobotToDestination(d.id)))
      for (const b of dest.nav) add(b, dest.actions[b.id])
      break
    }
    case 'simulate': {
      const a = s.attendee
      if (!a.running || a.phase === 'done')
        add(btn('sim:start', 'Start', { variant: 'primary' }), () => {
          resetAttendeeSimulation()
          startAttendeeSimulation()
        })
      else if (a.paused) add(btn('sim:resume', 'Resume'), () => resumeAttendeeSimulation())
      else add(btn('sim:pause', 'Pause'), () => pauseAttendeeSimulation())
      add(btn('sim:reset', 'Reset Simulation', { disabled: !(a.running || a.phase !== 'idle') }), () => resetAttendeeSimulation())
      break
    }
    case 'view': {
      add(btn('view:rays', s.rays ? 'Rays · On' : 'Rays', on(s.rays)), toggleRays)
      add(btn('view:surface', s.surface === 'real' ? 'Floor: Real' : 'Floor: Virtual', on(s.surface === 'real')), toggleSurface)
      add(btn('snap', s.snap ? 'Align to Grid · On' : 'Align to Grid', on(s.snap)), () => ed().set({ snap: !s.snap }))
      for (const id of SCALE_IDS) add(btn(`scale:${id}`, SCALE_SHORT[id], on(s.worldScale === id)), () => ed().set({ worldScale: id }))
      add(btn('view:place', s.placing ? 'Cancel placing' : 'Place world (AR)', { ...on(s.placing), disabled: !s.inAR }), togglePlaceCity)
      add(btn('page:room', 'Real room ›'), () => openPage('room'))
      add(btn('page:styles', 'Styles ›'), () => openPage('styles'))
      break
    }
    case 'room': {
      add(btn('room:occlusion', s.occlusion ? 'Hide behind real · On' : 'Hide behind real', on(s.occlusion)), toggleOcclusion)
      add(btn('room:surfaces', s.realSurfaces ? 'Real surfaces · On' : 'Real surfaces', on(s.realSurfaces)), toggleRealSurfaces)
      add(btn('room:scan', 'Scan room', { disabled: !s.inAR }), () =>
        scanRoom() ? undefined : { ok: false, error: 'Scan room is not available here. Use Settings > Physical Space > Space Setup.' },
      )
      add(btn('room:gestures', s.gestures ? 'Hand gestures · On' : 'Hand gestures', on(s.gestures)), () => ed().set({ gestures: !s.gestures }))
      add(btn('room:mocap', s.mocap.enabled ? `Mocap: ${s.mocap.status}` : 'Motion capture', on(s.mocap.enabled && s.mocap.status === 'live')), toggleMocap)
      break
    }
    case 'save': {
      add(btn('save:save', 'Save World', { variant: 'primary' }), savePaletteWorld)
      add(btn('save:as-new', 'Save as new'), () => worldActions.saveWorld(useWorldLibrary.getState().activeName))
      add(btn('page:saved', 'Load World ›'), () => {
        worldActions.listSavedWorlds()
        setOffset('saved', 0)
        openPage('saved')
      })
      for (const t of s.templates) add(btn(`new:${t.id}`, `New: ${t.name}`), () => createPaletteWorld(t.id as Parameters<typeof createPaletteWorld>[0]))
      break
    }
    case 'saved': {
      const list = paged(s, 'saved', s.saves, 6)
      for (const w of list.items) add(btn(`load:${w.id}`, w.label), () => loadPaletteSave(w.id))
      for (const b of list.nav) add(b, list.actions[b.id])
      break
    }
    case 'assets': {
      const list = paged(s, 'assets', s.assets, 6)
      for (const a of list.items) add(btn(`asset:${a.id}`, a.name, on(s.tool === 'asset' && s.assetId === a.id)), () => worldActions.selectCatalogAsset(a.id))
      add(btn('rotate:-1', 'Rotate −90°'), () => worldActions.rotateCatalogAsset(-1))
      add(btn('rotate:1', 'Rotate +90°'), () => worldActions.rotateCatalogAsset(1))
      for (const b of list.nav) add(b, list.actions[b.id])
      break
    }
    case 'events': {
      const list = paged(s, 'events', s.events, 6)
      for (const e of list.items)
        add(btn(`event:${e.id}`, e.label, on(s.tool === 'event' && s.eventId === e.id)), () => {
          ed().set({ eventCatalogId: e.id })
          worldActions.setTool('event')
        })
      add(btn('rotate:-1', 'Rotate −90°'), () => worldActions.rotateCatalogAsset(-1))
      add(btn('rotate:1', 'Rotate +90°'), () => worldActions.rotateCatalogAsset(1))
      for (const b of list.nav) add(b, list.actions[b.id])
      break
    }
    case 'actors': {
      for (const kind of ACTOR_KINDS)
        add(btn(`actor:${kind}`, `Place ${ACTOR_CATALOG[kind].name}`, on(s.tool === 'actor' && s.actorKind === kind)), () => worldActions.selectActorKind(kind))
      add(btn('actor:next', 'Next actor'), cycleActor)
      add(btn('page:actor-settings', 'Actor settings ›', { disabled: !s.actor }), () => openPage('actor-settings'))
      add(btn('actor:goal', 'Set destination', { disabled: !s.actor }), () => worldActions.setTool('goal'))
      add(btn('actor:stop', 'Stop actor', { disabled: !s.actor }), () => s.actor && worldActions.setActorGoal(s.actor.id, null))
      add(btn('actor:delete', 'Delete actor', { variant: 'danger', disabled: !s.actor }), deleteActor)
      break
    }
    case 'actor-settings': {
      const actor = s.actor ? useWorld.getState().actors[s.actor.id] : undefined
      const colors = ['#ffb86b', '#65cdd0', '#a7bd72', '#b98de0', '#ed7185', '#eeeeee']
      const no = { disabled: !actor }
      add(btn('actor:next', 'Next actor'), cycleActor)
      add(btn('actor:color', 'Cycle color', no), () => actor && worldActions.updateActor(actor.id, { color: colors[(colors.indexOf(actor.color) + 1) % colors.length] }))
      add(btn('actor:slower', 'Slower', no), () => actor && worldActions.updateActor(actor.id, { speed: Math.max(0.1, actor.speed - 0.2) }))
      add(btn('actor:faster', 'Faster', no), () => actor && worldActions.updateActor(actor.id, { speed: Math.min(8, actor.speed + 0.2) }))
      for (const [id, k] of [['smaller', 0.9], ['larger', 1.1]] as const)
        add(btn(`actor:${id}`, id === 'smaller' ? 'Smaller' : 'Larger', no), () =>
          actor && worldActions.updateActor(actor.id, { size: actor.size.map((v) => Math.max(0.3, Math.min(8, v * k))) as [number, number, number] }),
        )
      add(btn('actor:duplicate', 'Duplicate actor', no), () => actor && worldActions.duplicateActor(actor.id))
      add(btn('actor:delete', 'Delete actor', { variant: 'danger', ...no }), deleteActor)
      break
    }
    case 'brush':
    case 'styles': {
      const b = s.brush
      const next = <T extends string>(values: readonly T[], value: string): T => values[(values.indexOf(value as T) + 1) % values.length]
      add(btn('brush:building', `Building: ${b.buildingStyle}`), () => ed().set({ buildingStyle: next(BUILDING_STYLE_IDS, b.buildingStyle) }))
      add(btn('brush:wall', `Wall: ${b.wallMaterial}`), () => ed().set({ wallMaterial: next(WALL_MATERIALS, b.wallMaterial) }))
      add(btn('brush:platform', `Platform: ${b.platformMaterial}`), () => ed().set({ platformMaterial: next(PLATFORM_MATERIALS, b.platformMaterial) }))
      add(btn('brush:roof', `Roof: ${b.roof}`), () => ed().set({ roof: b.roof === 'flat' ? 'pitched' : 'flat' }))
      add(btn('brush:decor', `Decoration: ${b.decor}`), () => ed().set({ decor: next(['tree', 'streetlight', 'crate'] as const, b.decor) }))
      add(btn('brush:tree', `Tree: ${b.treeStyle}`), () => ed().set({ treeStyle: next(TREE_STYLES, b.treeStyle) }))
      break
    }
  }
  return { items, actions }
}

function cycleActor() {
  const w = useWorld.getState()
  const ids = [null, ...Object.keys(w.actors)]
  worldActions.selectActor(ids[(ids.indexOf(w.selectedActorId) + 1) % ids.length])
  worldActions.setTool('select')
}

async function deleteActor() {
  const w = useWorld.getState()
  const actor = w.selectedActorId ? w.actors[w.selectedActorId] : undefined
  if (actor && (await requestConfirmation({ type: 'DELETE', message: `Delete ${actor.name}?` }))) worldActions.removeActor(actor.id)
}

const STATUS_TEXT: Record<string, string> = { idle: 'No goal set', moving: 'Robot moving', paused: 'Route paused', arrived: 'Arrived', 'no-path': 'No route to goal' }

function statusChip(s: PaletteSnapshot): Item {
  const tone = s.nav.status === 'moving' ? 'live' : s.nav.status === 'no-path' ? 'warn' : 'idle'
  const what = s.actor ? `${s.actor.name} · ${s.actor.status}` : s.selected ? (getAsset(s.selected.assetId || '')?.name ?? s.selected.kind) : 'Nothing selected'
  const nav = `${STATUS_TEXT[s.nav.status] ?? s.nav.status}${s.nav.replans ? ` · replans ${s.nav.replans}` : ''}`
  return { type: 'chip', text: `${nav} · ${what}`, tone, flex: 1 }
}

/** The palette as a PanelSpec plus its actions. Pure: everything it shows comes from `s`. */
export function buildPalette(s: PaletteSnapshot): PaletteModel {
  const actions: Record<string, () => unknown> = {
    home: () => executeVoiceCommand({ type: 'GO_HOME' }, { confirm: voiceConfirm }),
    exit: () => exitXR(),
    collapse: () => setPaletteHidden(!s.collapsed),
    close: () => closePalette(),
    back: () => backPage(),
  }
  const title: Card = {
    type: 'card',
    tone: 'brand',
    blocks: [
      { type: 'row', items: [{ type: 'handle', id: 'move', label: 'Move: grab here, or point and pull' }] },
      {
        type: 'row',
        items: [
          btn('home', '← Home', { width: 'auto' }),
          { type: 'logo', size: 22 },
          { type: 'text', text: 'RealmForge XR', font: 'display', size: 18.4, weight: 800, flex: 1 },
          btn('exit', 'Exit VR', { variant: 'primary', width: 'auto' }),
          btn('collapse', s.collapsed ? 'Expand' : 'Collapse', { width: 'auto' }),
          btn('close', 'Close', { width: 'auto' }),
        ],
      },
    ],
  }
  if (s.collapsed && !s.confirm) return { spec: { width: PALETTE_WIDTH, cards: [title] }, actions }

  const cards: Card[] = [title]
  if (s.confirm) {
    const id = s.confirm.id
    actions['confirm:no'] = () => resolveConfirmation(id, false)
    actions['confirm:yes'] = () => resolveConfirmation(id, true)
    cards.push({
      type: 'card',
      gap: 12,
      blocks: [
        { type: 'row', items: [{ type: 'text', text: 'Please confirm', size: 13, weight: 600, color: 'copper', flex: 1 }] },
        { type: 'row', items: [{ type: 'text', text: s.confirm.message, size: 14, weight: 500, maxLines: 4, flex: 1 }] },
        { type: 'row', items: [btn('confirm:no', 'Cancel'), btn('confirm:yes', 'Confirm', { variant: 'primary' })] },
      ],
    })
    return { spec: { width: PALETTE_WIDTH, cards }, actions }
  }

  const section: ToolbarSection | null = isSection(s.page) ? s.page : null
  cards.push({
    type: 'card',
    padding: 8,
    blocks: [
      {
        type: 'row',
        gap: 4,
        items: TOOLBAR_SECTIONS.map((t) => {
          actions[`section:${t.id}`] = () => openPage(t.id)
          const activeTab = section === t.id || (!section && sectionOf(s.page) === t.id)
          return btn(`section:${t.id}`, t.label, { variant: activeTab ? 'on' : 'tab', flex: t.label.length > 6 ? 1.35 : 1 })
        }),
      },
    ],
  })

  const content = pageContent(s)
  Object.assign(actions, content.actions)
  const header: Item[] = s.canBack
    ? [btn('back', '‹ Back', { width: 'auto' }), { type: 'text', text: `${PAGE_TITLE[sectionOf(s.page)]} › ${PAGE_TITLE[s.page]}`, size: 12.5, weight: 600, color: 'copper', flex: 1 }]
    : [{ type: 'text', text: TOOLBAR_SECTIONS.find((t) => t.id === s.page)?.hint ?? PAGE_TITLE[s.page], size: 11.5, color: 'muted', flex: 1 }]
  cards.push({
    type: 'card',
    blocks: [
      { type: 'row', items: header, height: 33 },
      { type: 'grid', columns: 3, rowHeight: 44, items: content.items.map((b) => (s.busy ? { ...b, disabled: true } : b)) },
    ],
  })

  cards.push({
    type: 'card',
    tone: 'bare',
    gap: 6,
    blocks: [
      { type: 'row', items: [statusChip(s)] },
      { type: 'row', items: [{ type: 'text', text: s.busy ? 'Working…' : s.message, size: 11.5, color: 'muted', maxLines: 2, flex: 1 }] },
    ],
  })

  actions.voice = () => undefined // wired by ControlPalette (needs the voice hook)
  actions.undo = () => worldActions.undo()
  actions.redo = () => worldActions.redo()
  actions.guide = () => (s.guideOpen ? useGuide.getState().closeGuide() : useGuide.getState().openGuide('start'))
  actions.recenter = () => usePaletteUI.setState((p) => ({ recenter: p.recenter + 1, spot: 'front' }))
  cards.push({
    type: 'card',
    padding: 8,
    blocks: [
      {
        type: 'row',
        items: [
          btn('voice', s.voice.listening ? (s.voice.partial ? `“${s.voice.partial}”` : 'Listening… speak now') : '🎤 Voice command', {
            variant: s.voice.listening ? 'on' : 'default',
            flex: 2.4,
          }),
          btn('undo', 'Undo', { disabled: !s.history.canUndo }),
          btn('redo', 'Redo', { disabled: !s.history.canRedo }),
          btn('guide', 'Guide', on(s.guideOpen)),
          btn('recenter', 'Recenter'),
        ],
      },
    ],
  })
  return { spec: { width: PALETTE_WIDTH, cards }, actions }
}

/** The section a page belongs to (sub-pages light up their parent tab). */
export function sectionOf(page: PalettePage): ToolbarSection {
  if (isSection(page)) return page
  if (page === 'saved') return 'save'
  if (page === 'styles' || page === 'room') return 'view'
  return 'build'
}

/** Read everything the palette shows from the live stores. */
export function readPaletteSnapshot(local: Pick<PaletteSnapshot, 'voice' | 'message' | 'confirm' | 'busy' | 'inAR'>): PaletteSnapshot {
  const ui = usePaletteUI.getState()
  const w = useWorld.getState()
  const ed = useEditor.getState()
  const route = useRoutePlan.getState()
  const nav = useNav.getState()
  const attendee = useAttendee.getState()
  const mocap = useMocap.getState()
  const actor = w.selectedActorId ? w.actors[w.selectedActorId] : undefined
  const page = currentPage(ui)
  return {
    ...local,
    page,
    canBack: ui.stack.length > 1 || !isSection(page),
    collapsed: ui.hidden,
    tool: w.tool,
    selected: w.selectedId ? (w.objects[w.selectedId] ?? null) : null,
    snap: ed.snap,
    rays: ed.rays,
    surface: ed.surface,
    worldScale: ed.worldScale,
    occlusion: ed.occlusion,
    realSurfaces: ed.realSurfaces,
    gestures: ed.gestures,
    mocap: { enabled: mocap.enabled, status: mocap.status },
    placing: usePlacement.getState().status === 'choosing',
    nav: { status: nav.status, replans: nav.replanCount },
    route: { waypoints: route.waypoints.length, playState: route.playState, label: routeStatusLabel(route) },
    flowDraft: !!useFlow.getState().draft,
    destinations: Object.values(w.objects)
      .filter((o) => o.destinationRole)
      .map((o) => ({ id: o.id, label: getAsset(o.assetId || '')?.name || String(o.destinationRole) })),
    attendee: { running: attendee.running, paused: attendee.paused, phase: attendee.phase },
    saves: useWorldLibrary.getState().worlds.map((s) => ({ id: s.id, label: readSpatial(s.id) ? `${s.name} (anchored)` : s.name })),
    templates: listTemplates().map((t) => ({ id: t.id, name: t.name })),
    assets: libraryAssets().map((a) => ({ id: a.id, name: a.name })),
    assetId: ed.assetId,
    assetRotationDeg: Math.round((ed.assetRotation * 180) / Math.PI),
    events: EVENT_CATALOG.map((e) => ({ id: e.id, label: e.label })),
    eventId: ed.eventCatalogId,
    actorKind: ed.actorKind,
    actor: actor ? { id: actor.id, name: actor.name, status: getActorRuntime(actor.id)?.status || 'idle' } : null,
    brush: { buildingStyle: ed.buildingStyle, wallMaterial: ed.wallMaterial, platformMaterial: ed.platformMaterial, roof: ed.roof, decor: ed.decor, treeStyle: ed.treeStyle },
    history: getHistoryState(),
    guideOpen: useGuide.getState().open,
    offsets: usePaletteOffsets.getState(),
  }
}
