import { calibrateScan, cycleScan, scanControls, showAllScans, soloScan } from '../scan/actions'
import { openScanPanel, patchScan, removeScan, startMeasuring, useScan } from '../scan/store'
import { listTemplates } from '../world/library'
import { ACTOR_CATALOG, ACTOR_KINDS } from '../actors/types'
import { actorRuntimeRevision, subscribeActorRuntime, getActorRuntime } from '../actors/runtime'
import { requestConfirmation } from '../world/confirmation'
import { getAsset } from '../world/assets'
import { libraryAssets, useAssetLibrary } from '../world/assetLibrary'
import { EVENT_CATALOG } from '../world/eventCatalog'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { worldActions } from '../world/actions'
import { flowActions } from '../flow/actions'
import { useWorld } from '../world/store'
import { getHistoryState, subscribeHistory } from '../world/history'
import { getConfirmation, resolveConfirmation, subscribeConfirmation } from '../world/confirmation'
import { useWorldLibrary } from '../world/persistence'
import { BUILDING_STYLE_IDS, WALL_MATERIALS, PLATFORM_MATERIALS, TREE_STYLES } from '../world/catalog'
import { useEditor } from '../editor/settings'
import { useNav } from '../nav/navigation'
import { togglePlaceCity, toggleRays, toggleSurface } from '../editor/xrInput'
import { PanelMoveBar } from './PanelMoveBar'
import { paletteAnchor, setPaletteHidden, summonPalette, usePaletteUI } from './paletteUI'
import { HAPTIC, pulse } from './haptics'
import { toggleMocap, useMocap } from '../mocap/store'
import { scanRoom } from './roomTracker'
import { toggleRealSurfaces } from './realSurfaces'
import { toggleOcclusion } from './occlusion'
import { readSpatial, useSpatial } from './spatialSave'
import { blockRoute } from '../editor/demo'
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
import { usePlacement } from './placement'
import { createPaletteWorld, deletePaletteSelection, editPaletteSelection, loadPaletteSave, savePaletteWorld } from './paletteActions'
import { FORGE } from '../theme/forge'
import { BrandLogo3D } from './BrandLogo3D'
import { useGuide } from '../guide/guideStore'
import { useVoiceCommands } from '../voice/useVoiceCommands'
import { VOICE_OPTIONS } from '../voice/sharedConfirm'
import { TOOLBAR_SECTIONS, SCALE_SHORT, type ToolbarSection } from '../editor/toolbar'
import { SCALE_IDS } from '../scene/worldRoot'
import {
  pauseAttendeeSimulation,
  resetAttendeeSimulation,
  resumeAttendeeSimulation,
  startAttendeeSimulation,
  useAttendee,
} from '../sim/attendee'

/** Actual Three.js controls: visible to both eyes and interactive with XR pointers. */
export function ControlPalette() {
  const session = useXR((s) => s.session)
  return session ? <PaletteContent /> : null
}

type Button = { label: string; run: () => unknown; active?: boolean; disabled?: boolean }
/**
 * In VR, editing a selection keeps its own tab: the desktop folds it into Build, but the in-headset
 * Edit page has more actions than fit on the Build page.
 */
const VR_TABS: { id: ToolbarSection | 'edit'; label: string }[] = [
  TOOLBAR_SECTIONS[0]!,
  { id: 'edit', label: 'Edit' },
  ...TOOLBAR_SECTIONS.slice(1),
]

type Page = 'scans' | 'scan-align' | 'scan-display' | 'scan-measure' | ToolbarSection | 'edit' | 'assets' | 'events' | 'room' | 'actors' | 'actor-settings' | 'brush' | 'saved' | 'styles'

function PaletteContent() {
  const root = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const [page, setPage] = useState<Page>('build')
  const [controlPage, setControlPage] = useState(0)
  const [realDistance, setRealDistance] = useState(1)
  const property = useScan()
  const scan = property.scan
  const inScans = page.startsWith('scan')
  useEffect(() => { setControlPage(0) }, [page])
  useEffect(() => { setRealDistance(1) }, [property.activeId])
  const fileControls = async () => {
    // Native file pickers / downloads are not reliable while an immersive session owns the display.
    // Exit explicitly; the same ScanPanel is then visible in the headset's ordinary browser.
    openScanPanel(true)
    await gl.xr.getSession()?.end()
  }

  // Collapsed / closed and recenter requests are shared with the wrist Menu (xr/paletteUI.ts).
  const hidden = usePaletteUI((s) => s.hidden)
  const closed = usePaletteUI((s) => s.closed)
  const setHidden = setPaletteHidden
  const recenter = usePaletteUI((s) => s.recenter)
  useAssetLibrary((s) => s.version)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Point and trigger / pinch to choose. Open Guide anytime.')
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  const voice = useVoiceCommands(VOICE_OPTIONS)
  useEffect(() => {
    if (voice.lastError) setMessage(`Voice: ${voice.lastError}`)
    else if (voice.lastResult && 'message' in voice.lastResult) setMessage(`Voice: ${voice.lastResult.message}`)
    else if (voice.lastTranscript) setMessage(`Heard: "${voice.lastTranscript}"`)
  }, [voice.lastTranscript, voice.lastResult, voice.lastError])
  const [savePage, setSavePage] = useState(0)
  const [assetPage, setAssetPage] = useState(0)
  const [eventPage, setEventPage] = useState(0)
  const [destinationPage, setDestinationPage] = useState(0)
  const [history, setHistory] = useState(getHistoryState)
  const request = useSyncExternalStore(subscribeConfirmation, getConfirmation, getConfirmation)
  const tool = useWorld((s) => s.tool)
  const objects = useWorld((s) => s.objects)
  const selected = useWorld((s) => s.selectedId ? s.objects[s.selectedId] : null)
  const actors = useWorld((s) => s.actors)
  const selectedActorId = useWorld((s) => s.selectedActorId)
  const actor = selectedActorId ? actors[selectedActorId] : undefined
  const attendee = useAttendee()
  useSyncExternalStore(subscribeActorRuntime, actorRuntimeRevision, actorRuntimeRevision)
  const cycleActor = () => {
    const ids = [null, ...Object.keys(actors)]
    worldActions.selectActor(ids[(ids.indexOf(selectedActorId) + 1) % ids.length])
    worldActions.setTool('select')
  }
  const deleteActor = async () => {
    if (actor && await requestConfirmation({ type: 'DELETE', message: 'Delete ' + actor.name + '?' })) worldActions.removeActor(actor.id)
  }
  const editor = useEditor()
  const mocap = useMocap()
  const placing = usePlacement((s) => s.status === 'choosing')
  const spatial = useSpatial((s) => s.status)
  const snap = editor.snap
  const inAR = useXR((s) => s.mode === 'immersive-ar')
  const status = useNav((s) => s.status)
  const route = useRoutePlan()
  const saves = useWorldLibrary((s) => s.worlds)
  const activeName = useWorldLibrary((s) => s.activeName)
  const positioned = useRef(false)
  const vectors = useMemo(() => ({ position: new THREE.Vector3(), direction: new THREE.Vector3(), yaw: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') }), [])

  useEffect(() => subscribeHistory(setHistory), [])
  // A confirmation always shows: reopen the palette in front of you if it was closed.
  useEffect(() => { if (!request) return; if (usePaletteUI.getState().closed) summonPalette(); else setHidden(false) }, [request])
  useEffect(() => { if (recenter) positioned.current = false }, [recenter])
  useEffect(() => { worldActions.listSavedWorlds() }, [])
  useFrame(() => {
    if (!root.current) return
    if (positioned.current) {
      // Let the wrist Menu know where it is (to decide between closing it and bringing it to you).
      root.current.getWorldPosition(paletteAnchor.position)
      paletteAnchor.placed = !usePaletteUI.getState().closed
      return
    }
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(vectors.position)
    camera.getWorldQuaternion(vectors.yaw)
    vectors.euler.setFromQuaternion(vectors.yaw, 'YXZ')
    vectors.yaw.setFromEuler(new THREE.Euler(0, vectors.euler.y, 0))
    // Session start: off to your left. Summoned from the wrist: straight ahead (left of the guide if it's open).
    if (usePaletteUI.getState().spot === 'front') vectors.direction.set(useGuide.getState().open ? -0.5 : 0, -0.1, -0.85)
    else vectors.direction.set(-0.55, -0.08, -1.05)
    vectors.direction.applyQuaternion(vectors.yaw)
    root.current.position.copy(vectors.position).add(vectors.direction)
    root.current.quaternion.copy(vectors.yaw)
    positioned.current = true
  })

  const run = async (button: Button) => {
    if (busy || button.disabled) return
    setBusy(true)
    try {
      const result = await button.run() as { ok?: boolean; error?: string; cancelled?: boolean } | undefined
      setMessage(result?.ok === false ? result.error || 'Action cancelled.' : `${button.label} done.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Action failed.') }
    finally { setBusy(false) }
  }

  const primaryTab =
    page.startsWith('scan') || page === 'assets' || page === 'events' || page === 'actors' || page === 'actor-settings' || page === 'brush'
      ? 'build'
      : page === 'saved'
        ? 'save'
        : page === 'styles' || page === 'room'
          ? 'view'
          : (page as ToolbarSection | 'edit')

  let buttons: Button[] = []
  if (page === 'build') {
    buttons = ([
      ['building', 'Building'],
      ['wall', 'Wall'],
      ['platform', 'Road / Platform'],
      ['decor', 'Decoration'],
    ] as const).map(([id, label]) => ({ label, active: tool === id, run: () => worldActions.setTool(id) }))
    buttons.push(
      { label: snap ? 'Align to Grid · On' : 'Align to Grid', active: snap, run: () => useEditor.getState().set({ snap: !snap }) },
      { label: 'Object catalog…', run: () => { setAssetPage(0); setPage('assets') } },
      { label: 'Event objects…', run: () => { setEventPage(0); setPage('events') } },
      { label: 'Actors…', run: () => setPage('actors') },
      { label: 'Materials…', run: () => setPage('brush') },
      { label: 'Property scans…', run: () => setPage('scans') },
    )
  } else if (page === 'scans') {
    buttons = [
      { label: 'Next scan section', disabled: !scan, run: cycleScan },
      { label: scan?.visible ? 'Hide section' : 'Show section', disabled: !scan, run: () => scan && patchScan({ visible: !scan.visible }) },
      { label: 'Align section…', disabled: !scan, run: () => setPage('scan-align') },
      { label: 'Display section…', disabled: !scan, run: () => setPage('scan-display') },
      { label: 'Measure scale…', disabled: !scan?.visible || property.status !== 'ready', run: () => setPage('scan-measure') },
      { label: 'Only this section', disabled: !scan, run: soloScan },
      { label: 'Show all sections', disabled: !scan, run: showAllScans },
      { label: 'Files / names (exit XR)', run: fileControls },
      { label: 'Remove section', disabled: !scan, run: async () => { if (scan && await requestConfirmation({ type: 'DELETE', message: `Remove “${scan.name}” from this property?` })) removeScan(scan.id) } },
      { label: 'Back to Build', run: () => setPage('build') },
    ]
  } else if (page === 'scan-align') {
    buttons = [...scanControls().filter((c) => c.id !== 'visibility' && c.id !== 'ceiling'),
      { label: 'Back to scans', run: () => setPage('scans') }]
  } else if (page === 'scan-display') {
    buttons = [
      ...scanControls().filter((c) => c.id === 'visibility' || c.id === 'ceiling'),
      { label: 'More transparent', disabled: !scan, run: () => scan && patchScan({ opacity: Math.max(0.1, scan.opacity - 0.1) }) },
      { label: 'More opaque', disabled: !scan, run: () => scan && patchScan({ opacity: Math.min(1, scan.opacity + 0.1) }) },
      { label: 'Ceiling cut −0.1 m', disabled: scan?.cutHeight == null, run: () => scan?.cutHeight != null && patchScan({ cutHeight: Math.max(0.5, scan.cutHeight - 0.1) }) },
      { label: 'Ceiling cut +0.1 m', disabled: scan?.cutHeight == null, run: () => scan?.cutHeight != null && patchScan({ cutHeight: Math.min(12, scan.cutHeight + 0.1) }) },
      { label: 'Floor / area label', disabled: !scan, run: () => { if (scan) { const labels = ['Ground floor', 'Upstairs', 'Outdoors']; patchScan({ level: labels[(labels.indexOf(scan.level ?? '') + 1) % labels.length] }) } } },
      { label: 'Back to scans', run: () => setPage('scans') },
    ]
  } else if (page === 'scan-measure') {
    buttons = [
      { label: 'Pick two points', disabled: !scan?.visible || property.status !== 'ready', active: property.measuring, run: () => { useEditor.getState().set({ rays: true }); startMeasuring() } },
      { label: 'Real distance −1 m', run: () => setRealDistance((d) => Math.max(0.01, Math.round((d - 1) * 100) / 100)) },
      { label: 'Real distance +1 m', run: () => setRealDistance((d) => Math.round((d + 1) * 100) / 100) },
      { label: 'Real distance −0.01 m', run: () => setRealDistance((d) => Math.max(0.01, Math.round((d - 0.01) * 100) / 100)) },
      { label: 'Real distance +0.01 m', run: () => setRealDistance((d) => Math.round((d + 0.01) * 100) / 100) },
      { label: `Apply ${realDistance.toFixed(2)} m`, disabled: property.measurePoints.length !== 2, run: () => calibrateScan(realDistance) ? undefined : { ok: false, error: 'Pick two distinct points and set a valid distance.' } },
      { label: 'Cancel measurement', run: () => startMeasuring(false) },
      { label: 'Back to scans', run: () => { startMeasuring(false); setPage('scans') } },
    ]
  } else if (page === 'edit') {
    buttons = ([
      ['rotate-left', 'Rotate left'],
      ['rotate-right', 'Rotate right'],
      ['grow', 'Wider'],
      ['shrink', 'Narrower'],
      ['raise', 'Taller'],
      ['lower', 'Shorter'],
      ['style', selected?.assetId ? 'Cycle color' : 'Material / style'],
      ['roof', 'Toggle roof'],
      ['duplicate', 'Duplicate'],
    ] as const).map(([action, label]) => ({
      label,
      disabled: !selected || (action === 'roof' && !!selected.assetId),
      run: () => editPaletteSelection(action),
    }))
    buttons.unshift({ label: 'Select', active: tool === 'select', run: () => worldActions.setTool('select') })
    buttons.push({ label: 'Delete', disabled: !selected, run: deletePaletteSelection })
  } else if (page === 'plan') {
    buttons = ([
      ['goal', 'Add Waypoint'],
      ['route', 'Flow Route'],
      ['robot', 'Place Robot'],
    ] as const).map(([id, label]) => ({
      label,
      active: tool === id,
      run: () => (id === 'route' ? flowActions.beginRoute('waypoint') : worldActions.setTool(id)),
    }))
    if (tool === 'route') {
      buttons.push({ label: 'Finish Flow Route', run: () => flowActions.finishRoute() })
    }
    if (route.playState === 'playing') {
      buttons.push({ label: 'Pause', run: () => pauseRoute() })
    } else {
      buttons.push({
        label: route.playState === 'paused' ? 'Resume' : 'Play Route',
        disabled: !route.waypoints.length,
        run: () => playRoute(),
      })
    }
    buttons.push(
      {
        label: 'Stop',
        disabled: route.playState !== 'playing' && route.playState !== 'paused',
        run: () => stopRoute(),
      },
      {
        label: 'Next Stop',
        disabled: route.playState !== 'playing' && route.playState !== 'paused',
        run: () => skipToNextWaypoint(),
      },
      {
        label: 'Remove Last',
        disabled: !route.waypoints.length || route.playState === 'playing' || route.playState === 'paused',
        run: () => removeLastWaypoint(),
      },
      { label: 'Clear Route', disabled: !route.waypoints.length, run: () => clearRoute() },
      { label: routeStatusLabel(route), disabled: true, run: () => undefined },
      { label: 'Block Path', run: blockRoute },
    )
    const destinations = Object.values(objects).filter((object) => object.destinationRole)
    const offset = Math.min(destinationPage, Math.max(0, Math.ceil(destinations.length / 4) - 1))
    buttons.push(
      ...destinations.slice(offset * 4, offset * 4 + 4).map((object, i) => ({
        label: `Go: ${getAsset(object.assetId || '')?.name || object.destinationRole} ${offset * 4 + i + 1}`,
        run: () => worldActions.sendRobotToDestination(object.id),
      })),
    )
    if (destinations.length > 4) {
      buttons.push(
        { label: 'Earlier destinations', disabled: offset === 0, run: () => setDestinationPage(offset - 1) },
        { label: 'More destinations', disabled: (offset + 1) * 4 >= destinations.length, run: () => setDestinationPage(offset + 1) },
      )
    }
  } else if (page === 'simulate') {
    const canReset = attendee.running || attendee.phase !== 'idle'
    if (!attendee.running || attendee.phase === 'done') {
      buttons.push({
        label: 'Start',
        run: () => {
          resetAttendeeSimulation()
          startAttendeeSimulation()
        },
      })
    } else if (attendee.paused) {
      buttons.push({ label: 'Resume', run: () => resumeAttendeeSimulation() })
    } else {
      buttons.push({ label: 'Pause', run: () => pauseAttendeeSimulation() })
    }
    buttons.push(
      { label: 'Reset Simulation', disabled: !canReset, run: () => resetAttendeeSimulation() },
      { label: `Robot: ${status}`, run: () => undefined, disabled: true },
      { label: `Attendee: ${attendee.phase}`, run: () => undefined, disabled: true },
    )
  } else if (page === 'view') {
    buttons = [
      { label: editor.rays ? 'See Through · On' : 'See Through Objects', active: editor.rays, run: toggleRays },
      {
        label: editor.surface === 'real' ? 'Floor: Real' : 'Floor: Virtual',
        active: editor.surface === 'real',
        run: toggleSurface,
      },
      { label: snap ? 'Align to Grid · On' : 'Align to Grid', active: snap, run: () => useEditor.getState().set({ snap: !snap }) },
      { label: placing ? 'Cancel placing' : 'Place world (AR)', active: placing, disabled: !inAR, run: togglePlaceCity },
      ...SCALE_IDS.map((id) => ({
        label: SCALE_SHORT[id],
        active: editor.worldScale === id,
        run: () => useEditor.getState().set({ worldScale: id }),
      })),
      { label: 'Advanced: styles…', run: () => setPage('styles') },
      { label: 'Real room…', run: () => setPage('room') },
    ]
  } else if (page === 'room') {
    // Mixed reality: your real room (Space Setup), plus gestures and motion capture.
    buttons = [
      { label: editor.occlusion ? 'Hide behind real · On' : 'Hide behind real', active: editor.occlusion, run: toggleOcclusion },
      { label: editor.realSurfaces ? 'Real surfaces · On' : 'Real surfaces', active: editor.realSurfaces, run: toggleRealSurfaces },
      { label: 'Scan room (Space Setup)', disabled: !inAR, run: () => (scanRoom() ? undefined : { ok: false, error: 'Scan room is not available here. Use Settings > Physical Space > Space Setup.' }) },
      { label: editor.gestures ? 'Hand gestures · On' : 'Hand gestures', active: editor.gestures, run: () => useEditor.getState().set({ gestures: !editor.gestures }) },
      { label: mocap.enabled ? `Motion capture: ${mocap.status}` : 'Motion capture', active: mocap.enabled && mocap.status === 'live', run: toggleMocap },
      { label: 'Back to View', run: () => setPage('view') },
    ]
  } else if (page === 'save') {
    buttons = listTemplates().map((template) => ({ label: template.name, run: () => createPaletteWorld(template.id) }))
    buttons.push(
      { label: 'Save World', run: savePaletteWorld },
      { label: 'Save as new', run: () => worldActions.saveWorld(activeName) },
      { label: 'Load World…', run: () => { worldActions.listSavedWorlds(); setSavePage(0); setPage('saved') } },
    )
  } else if (page === 'events') {
    // Event / venue objects (chairs, tables, booths, stages, signs…) from the universal event catalog.
    const offset = Math.min(eventPage, Math.ceil(EVENT_CATALOG.length / 6) - 1)
    buttons = EVENT_CATALOG.slice(offset * 6, offset * 6 + 6).map((item) => ({
      label: item.label,
      active: tool === 'event' && editor.eventCatalogId === item.id,
      run: () => {
        useEditor.getState().set({ eventCatalogId: item.id })
        worldActions.setTool('event')
        setMessage('Aim at the floor and pinch / pull the trigger to place.')
      },
    }))
    buttons.push(
      { label: 'Rotate −90°', run: () => worldActions.rotateCatalogAsset(-1) },
      { label: 'Rotate +90°', run: () => worldActions.rotateCatalogAsset(1) },
      { label: 'Previous objects', disabled: offset === 0, run: () => setEventPage(offset - 1) },
      { label: 'More objects', disabled: (offset + 1) * 6 >= EVENT_CATALOG.length, run: () => setEventPage(offset + 1) },
      { label: 'Back to Build', run: () => setPage('build') },
    )
  } else if (page === 'assets') {
    const offset = Math.min(assetPage, Math.ceil(libraryAssets().length / 6) - 1)
    buttons = libraryAssets().slice(offset * 6, offset * 6 + 6).map((asset) => ({
      label: asset.name,
      active: tool === 'asset' && editor.assetId === asset.id,
      run: () => {
        worldActions.selectCatalogAsset(asset.id)
        setMessage('Aim at ground: green places, red is blocked.')
      },
    }))
    buttons.push(
      { label: 'Rotate −90°', run: () => worldActions.rotateCatalogAsset(-1) },
      { label: 'Rotate +90°', run: () => worldActions.rotateCatalogAsset(1) },
      { label: 'Previous objects', disabled: offset === 0, run: () => setAssetPage(offset - 1) },
      { label: 'More objects', disabled: (offset + 1) * 6 >= libraryAssets().length, run: () => setAssetPage(offset + 1) },
      { label: 'Back to Build', run: () => setPage('build') },
    )
  } else if (page === 'actors') {
    buttons = ACTOR_KINDS.map((kind) => ({
      label: 'Place ' + ACTOR_CATALOG[kind].name,
      active: tool === 'actor' && editor.actorKind === kind,
      run: () => worldActions.selectActorKind(kind),
    }))
    buttons.push(
      { label: 'Next actor / robot', run: cycleActor },
      { label: 'Actor settings…', disabled: !actor, run: () => setPage('actor-settings') },
      { label: 'Set actor destination', disabled: !actor, run: () => worldActions.setTool('goal') },
      { label: 'Stop actor', disabled: !actor, run: () => actor && worldActions.setActorGoal(actor.id, null) },
      { label: 'Duplicate actor', disabled: !actor, run: () => actor && worldActions.duplicateActor(actor.id) },
      { label: 'Delete actor', disabled: !actor, run: deleteActor },
      { label: 'Back to Build', run: () => setPage('build') },
    )
  } else if (page === 'actor-settings') {
    const colors = ['#ffb86b', '#65cdd0', '#a7bd72', '#b98de0', '#ed7185', '#eeeeee']
    buttons = [
      { label: 'Next actor', run: cycleActor },
      { label: 'Cycle color', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { color: colors[(colors.indexOf(actor.color) + 1) % colors.length] }) },
      ...[-0.2, 0.2].map((delta) => ({ label: delta < 0 ? 'Slower' : 'Faster', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { speed: Math.max(0.1, Math.min(8, actor.speed + delta)) }) })),
      ...[0.9, 1.1].map((scale) => ({ label: scale < 1 ? 'Smaller' : 'Larger', disabled: !actor, run: () => actor && worldActions.updateActor(actor.id, { size: actor.size.map((v) => Math.max(0.3, Math.min(8, v * scale))) as [number, number, number] }) })),
      { label: 'Duplicate actor', disabled: !actor, run: () => actor && worldActions.duplicateActor(actor.id) },
      { label: 'Delete actor', disabled: !actor, run: deleteActor },
      { label: 'Back to actors', run: () => setPage('actors') },
    ]
  } else if (page === 'brush' || page === 'styles') {
    const next = <T extends string,>(values: readonly T[], value: T): T => values[(values.indexOf(value) + 1) % values.length]
    buttons = [
      { label: `Building: ${editor.buildingStyle}`, run: () => editor.set({ buildingStyle: next(BUILDING_STYLE_IDS, editor.buildingStyle) }) },
      { label: `Wall: ${editor.wallMaterial}`, run: () => editor.set({ wallMaterial: next(WALL_MATERIALS, editor.wallMaterial) }) },
      { label: `Platform: ${editor.platformMaterial}`, run: () => editor.set({ platformMaterial: next(PLATFORM_MATERIALS, editor.platformMaterial) }) },
      { label: `Roof: ${editor.roof}`, run: () => editor.set({ roof: editor.roof === 'flat' ? 'pitched' : 'flat' }) },
      { label: `Decoration: ${editor.decor}`, run: () => editor.set({ decor: next(['tree', 'streetlight', 'crate'] as const, editor.decor) }) },
      { label: `Tree: ${editor.treeStyle}`, run: () => editor.set({ treeStyle: next(TREE_STYLES, editor.treeStyle) }) },
      { label: page === 'styles' ? 'Back to View' : 'Back to Build', run: () => setPage(page === 'styles' ? 'view' : 'build') },
    ]
  } else if (page === 'saved') {
    const offset = Math.min(savePage, Math.max(0, Math.ceil(saves.length / 6) - 1))
    buttons = saves.slice(offset * 6, offset * 6 + 6).map((save) => ({ label: readSpatial(save.id) ? `${save.name} (anchored)` : save.name, run: () => loadPaletteSave(save.id) }))
    buttons.push(
      { label: 'Previous saves', disabled: offset === 0, run: () => setSavePage(offset - 1) },
      { label: 'Next saves', disabled: (offset + 1) * 6 >= saves.length, run: () => setSavePage(offset + 1) },
      { label: 'Back to Save', run: () => setPage('save') },
    )
  }

  const lastControlPage = Math.max(0, Math.ceil(buttons.length / 8) - 1)
  const currentControlPage = Math.min(controlPage, lastControlPage)
  const visibleButtons = buttons.length > 10 ? [
    ...buttons.slice(currentControlPage * 8, currentControlPage * 8 + 8),
    { label: 'Previous controls', disabled: currentControlPage === 0, run: () => setControlPage(currentControlPage - 1) },
    { label: 'More controls', disabled: currentControlPage === lastControlPage, run: () => setControlPage(currentControlPage + 1) },
  ] : buttons
  const scanMessage = !scan ? 'Add GLB sections or open a property bundle via Files (exit XR).' :
    page === 'scan-measure' && property.measuring ? `Pick two scan points: ${property.measurePoints.length}/2. Real distance: ${realDistance.toFixed(2)} m.` :
    `${scan.name} · ${scan.level || 'Property'} · floor ${scan.offset[1].toFixed(2)} m · ${property.status}. Scans are visual; navigation uses the flat ground plane.`

  return <group ref={root} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
    {!closed && <>
    <PanelMoveBar target={root} y={0.45} width={0.65} />
    <Tile
      text={voice.isListening ? (voice.lastPartial ? `"${voice.lastPartial}" · pause to run` : 'Listening… speak now') : 'Voice command: tap and speak'}
      y={0.39}
      width={0.65}
      height={0.065}
      active={voice.isListening}
      onClick={() => void (voice.isListening ? voice.stopListening() : voice.startListening())}
    />
    <BrandLogo3D position={[-0.285, 0.32, 0.002]} size={0.056} />
    <Tile text={hidden ? 'Show controls' : 'RealmForge controls'} y={0.32} width={0.65} height={0.065} onClick={() => { if (!request) setHidden(!hidden) }} />
    {!hidden && <>
      <Tile text={`${actor ? getActorRuntime(actor.id)?.status || 'idle' : status} · ${actor ? actor.name : selected ? (getAsset(selected.assetId || '')?.name || selected.kind) : 'no selection'}`} x={-0.11} y={0.267} height={0.035} width={0.43} />
      <Tile text={editor.rays ? 'See-through on' : 'See-through'} x={0.22} y={0.267} height={0.035} width={0.21} active={editor.rays} onClick={toggleRays} />
      {request ? <>
        <Tile text={request.message} y={0.08} height={0.29} width={0.65} />
        <Tile text="Cancel" x={-0.165} y={-0.12} width={0.31} onClick={() => resolveConfirmation(request.id, false)} />
        <Tile text="Confirm" x={0.165} y={-0.12} width={0.31} active onClick={() => resolveConfirmation(request.id, true)} />
      </> : <>
        {VR_TABS.map((tab, i) => (
          <Tile
            key={tab.id}
            text={tab.label.split(' ')[0]}
            x={(i - 2.5) * 0.108}
            y={0.21}
            width={0.102}
            active={primaryTab === tab.id}
            onClick={() => { startMeasuring(false); setPage(tab.id) }}
          />
        ))}
        {visibleButtons.map((button, i) => (
          <Tile
            key={page + button.label + i}
            text={button.label}
            x={i % 2 ? 0.165 : -0.165}
            y={0.135 - Math.floor(i / 2) * 0.07}
            width={0.31}
            disabled={busy || button.disabled}
            active={button.active}
            onClick={() => void run(button)}
          />
        ))}
        <Tile text="Undo" x={-0.24} y={-0.235} width={0.15} disabled={busy || !history.canUndo} onClick={() => worldActions.undo()} />
        <Tile text="Redo" x={-0.08} y={-0.235} width={0.15} disabled={busy || !history.canRedo} onClick={() => worldActions.redo()} />
        <Tile text={guideOpen ? 'Close guide' : 'Guide'} x={0.08} y={-0.235} width={0.15} active={guideOpen} onClick={() => (guideOpen ? closeGuide() : openGuide('start'))} />
        <Tile text="Recenter" x={0.24} y={-0.235} width={0.15} onClick={() => { positioned.current = false }} />
        <Tile text={busy ? 'Working…' : inScans ? scanMessage : page === 'assets' ? `${getAsset(editor.assetId)?.name} · ${Math.round(editor.assetRotation * 180 / Math.PI)}° · Aim at clear ground.` : (page === 'save' || page === 'saved') && spatial !== 'idle' ? `Saved spot in this room: ${spatial}. ${message}` : message} y={-0.31} width={0.65} height={0.065} />
      </>}
    </>}
    </>}
  </group>
}

/** Canvas labels avoid network fonts and HTML overlays, which disappear in immersive XR. */
function Tile({ text, x = 0, y, width, height = 0.06, active = false, disabled = false, onClick }: {
  text: string; x?: number; y: number; width: number; height?: number; active?: boolean; disabled?: boolean; onClick?: () => void
}) {
  const [hover, setHover] = useState(false)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024; canvas.height = Math.round(1024 * height / width)
    const context = canvas.getContext('2d')!
    context.fillStyle = disabled ? FORGE.panelDisabled : active ? FORGE.emberActive : hover && onClick ? FORGE.hover : FORGE.panelMuted
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = active ? FORGE.emberHot : FORGE.emberDeep
    context.fillRect(0, 0, canvas.width, Math.max(6, Math.round(canvas.height * 0.06)))
    context.strokeStyle = active ? FORGE.emberHot : FORGE.lineSoft
    context.lineWidth = 5
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
    context.fillStyle = disabled ? FORGE.textMuted : FORGE.text
    const font = Math.round(1024 * 0.018 / width)
    context.font = `600 ${font}px "Sora", "Segoe UI", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const words = text.split(/\s+/); const lines: string[] = []; let line = ''
    for (const word of words) { const candidate = line ? line + ' ' + word : word; if (line && context.measureText(candidate).width > 940) { lines.push(line); line = word } else line = candidate }
    if (line) lines.push(line)
    lines.forEach((value, i) => context.fillText(value, 512, canvas.height / 2 + (i - (lines.length - 1) / 2) * font * 1.3, 940))
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [text, height, width, active, disabled, hover, onClick != null])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[x, y, 0]} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)} onPointerDown={(e) => { e.stopPropagation(); if (!disabled) { pulse('active', HAPTIC.press); onClick?.() } }} onClick={(e) => e.stopPropagation()}>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
  </mesh>
}
