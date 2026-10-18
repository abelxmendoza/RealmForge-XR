/**
 * Desktop HUD: six primary sections (Build / Edit / Plan Routes / Simulate / View / Save).
 * Preserves existing actions and keyboard shortcuts; shortcuts appear in tooltips only.
 */
import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'
import { worldActions } from '../world/actions'
import { confirmReplace, requestConfirmation } from '../world/confirmation'
import { detectXRSupport, enterARWithFallback, useXRSessionMeta, useXRSupport } from '../xr/session'
import { usePlacement } from '../xr/placement'
import { useWorld, type Tool } from '../world/store'
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
import { blockRoute } from './demo'
import { openWorldLibrary } from './WorldLibrary'
import { openObjectLibrary } from './Inspector'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { useEditor } from './settings'
import { downloadWorld, importWorld, quickSave, useWorldLibrary } from '../world/persistence'
import { redo, undo, subscribeHistory } from '../world/history'
import { toggleRays, toggleSurface } from './xrInput'
import { toggleOcclusion } from '../xr/occlusion'
import { toggleRealSurfaces } from '../xr/realSurfaces'
import { toggleMocap, useMocap } from '../mocap/store'
import { SCALE_IDS, type ScaleId } from '../scene/worldRoot'
import { HOME_HREF, leaveEditor } from './leaveEditor'
import { useGuide } from '../guide/guideStore'
import { editPaletteSelection } from '../xr/paletteActions'
import {
  pauseAttendeeSimulation,
  resetAttendeeSimulation,
  resumeAttendeeSimulation,
  startAttendeeSimulation,
  useAttendee,
} from '../sim/attendee'
import { TOOLBAR_SECTIONS, TOOLBAR_TOOLS, SCALE_LABELS, type ToolbarSection } from './toolbar'
import { useHudSection } from './hudSectionStore'
import { xrStore } from '../xr/xrStore'

const STATUS_TEXT = {
  idle: 'No destination yet',
  moving: 'Robot moving',
  paused: 'Route paused',
  arrived: 'Arrived',
  'no-path': 'No route to goal',
} as const

const PHASE_LABEL: Record<string, string> = {
  idle: 'Idle',
  walking: 'Walking',
  serving: 'At destination',
  done: 'Done',
  blocked: 'Blocked',
  'no-path': 'No path',
}

/** Phone / small-tablet layout: the menu collapses to its top bar so the world stays visible. */
const COMPACT_QUERY = '(max-width: 820px), (max-height: 520px)'
const isCompact = () => typeof window !== 'undefined' && window.matchMedia?.(COMPACT_QUERY).matches === true

/** Robot status for the pill: says what to do next when idle, and only counts replans once there are some. */
function robotStatusLine(status: keyof typeof STATUS_TEXT, replans: number) {
  const text = status === 'idle' ? `${STATUS_TEXT.idle} · Plan Routes → Add Waypoint` : STATUS_TEXT[status]
  return replans > 0 ? `${text} · replans ${replans}` : text
}

function tooltip(base: string, disabledWhy?: string) {
  return disabledWhy ? `${base} — ${disabledWhy}` : base
}

export function ToolbarHud() {
  const tool = useWorld((s) => s.tool)
  const setTool = worldActions.setTool
  const selectedId = useWorld((s) => s.selectedId)
  const status = useNav((s) => s.status)
  const replans = useNav((s) => s.replanCount)
  const route = useRoutePlan()
  const [routeMsg, setRouteMsg] = useState<string | null>(null)
  const snap = useEditor((s) => s.snap)
  const placement = usePlacement((s) => s.status)
  const xrError = useXRSessionMeta((s) => s.lastError)
  const entering = useXRSessionMeta((s) => s.entering)
  const xrSupport = useXRSupport()
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const dirty = useWorldLibrary((s) => s.dirty)
  const worldScale = useEditor((s) => s.worldScale)
  const rays = useEditor((s) => s.rays)
  const surface = useEditor((s) => s.surface)
  const occlusion = useEditor((s) => s.occlusion)
  const realSurfaces = useEditor((s) => s.realSurfaces)
  const mocap = useMocap()
  const attendee = useAttendee()
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const section = useHudSection((s) => s.section)
  const setSection = useHudSection((s) => s.setSection)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  const fileInput = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(() => !isCompact())
  /** On small screens, close the menu once a tool is chosen so you can place on the world. */
  const pickTool = (id: Tool) => {
    setTool(id)
    if (isCompact()) setMenuOpen(false)
  }
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])
  useEffect(() => void detectXRSupport(), [])

  /** No headset here: copy the editor link so it can be opened in the Quest Browser. */
  const shareToHeadset = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareMsg('Link copied. Open it in the Quest Browser, then press Enter XR.')
    } catch {
      setShareMsg(`Open ${window.location.href} in the Quest Browser, then press Enter XR.`)
    }
  }

  // Follow placement / route tools into their section when the keyboard picks them (1–0).
  // Leave Select alone so first-time users stay on Build until they choose.
  useEffect(() => {
    const t = TOOLBAR_TOOLS.find((x) => x.id === tool)
    if (t && t.id !== 'select') setSection(t.section)
  }, [tool])

  const statusTone = status === 'moving' || mocap.status === 'live' ? 'live' : status === 'no-path' || mocap.status === 'error' ? 'warn' : ''
  const noSelection = !selectedId ? 'Select an object first' : undefined
  const sectionTools = TOOLBAR_TOOLS.filter((t) => t.section === section)

  const onDelete = async () => {
    if (!selectedId) return
    if (await requestConfirmation({ type: 'DELETE', message: 'Delete the selected object?' })) deleteSelected()
  }

  const onClearWorld = async () => {
    if (await confirmReplace('Clear the current world? Unsaved changes will be lost.')) useWorld.getState().reset()
  }

  const onSave = async () => {
    const r = await quickSave()
    if (r.ok) setSaveMsg('World saved.')
    else if (!r.cancelled) setSaveMsg(r.error || 'Save failed.')
    else setSaveMsg(null)
  }

  const onExport = () => {
    const r = downloadWorld()
    setSaveMsg(r.ok ? 'Download started.' : r.error || 'Export failed.')
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    const r = await importWorld(file)
    if (r.ok) setSaveMsg(`Imported ${file.name}`)
    else if (!r.cancelled) setSaveMsg(r.error || 'Import failed.')
  }

  return (
    <div className={`hud${menuOpen ? '' : ' hud-collapsed'}`}>
      <div className="hud-brand">
        <a
          className="editor-home"
          href={HOME_HREF}
          title="Back to project page"
          onClick={async (event) => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !useWorldLibrary.getState().dirty) return
            event.preventDefault()
            if (await confirmReplace('Leave the editor? Save your world first to keep your unsaved changes.')) leaveEditor()
          }}
        >
          ← Home
        </a>
        <div className="hud-logo">
          <img className="hud-logo-img" src={BRAND.logo} width="28" height="28" alt="" aria-hidden />
          <span>
            RealmForge XR
            {dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
          </span>
        </div>
        <button
          type="button"
          className={`hud-menu-toggle${menuOpen ? ' on' : ''}`}
          aria-expanded={menuOpen}
          aria-controls="hud-menu"
          title={menuOpen ? 'Collapse the menu' : 'Show tools and sections'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Close' : 'Menu'} <span aria-hidden="true">{menuOpen ? '▴' : '▾'}</span>
        </button>
        <div className="hud-session">
          {(xrSupport.ar || xrSupport.vr) && (
            <button
              type="button"
              className="primary"
              disabled={entering}
              title={xrSupport.ar ? 'Enter immersive mode with passthrough (AR)' : 'Enter immersive mode (VR)'}
              onClick={() => void (xrSupport.ar ? enterARWithFallback() : xrStore.enterVR())}
            >
              {entering ? 'Entering…' : 'Enter XR'}
            </button>
          )}
          {xrSupport.ar && xrSupport.vr && (
            <button
              type="button"
              className="ghost hud-vr-alt"
              title="VR only — no camera passthrough. Prefer Enter XR on Quest."
              onClick={() => void xrStore.enterVR()}
            >
              VR
            </button>
          )}
          {xrSupport.checked && !xrSupport.ar && !xrSupport.vr && (
            <button
              type="button"
              className="primary"
              title="This device has no headset. Copy the link to open it on a Quest."
              onClick={() => void shareToHeadset()}
            >
              Open on Quest
            </button>
          )}
          {xrSupport.ar && (
            <button
              type="button"
              onClick={() => {
                const p = usePlacement.getState()
                if (p.status === 'choosing') p.cancelChoosing()
                else p.startChoosing()
              }}
              title="Pin the miniature world onto a real table or floor (AR)"
            >
              {placement === 'choosing' ? 'Cancel place' : 'Place world'}
            </button>
          )}
          {placement === 'pinned' && (
            <button type="button" className="ghost" onClick={() => usePlacement.getState().resetToDefault()}>
              Unpin
            </button>
          )}
          <button
            type="button"
            className={guideOpen ? 'on' : ''}
            aria-pressed={guideOpen}
            title="User & controls guide (?)"
            onClick={() => (guideOpen ? closeGuide() : openGuide('start'))}
          >
            Guide
          </button>
        </div>
      </div>

      {shareMsg && (
        <p className="hint-banner" role="status">
          {shareMsg}
        </p>
      )}

      <div className="status" role="status">
        <span className={`status-dot${statusTone ? ` ${statusTone}` : ''}`} aria-hidden />
        <span>
          {robotStatusLine(status, replans)}
          {dirty ? ' · unsaved' : ''}
          {mocap.enabled && ` · motion capture ${mocap.status}${mocap.status === 'live' ? ` ${mocap.fps} fps` : ''}`}
        </span>
      </div>

      <div className="hud-menu" id="hud-menu">
      <nav className="hud-panel hud-nav" aria-label="Editor sections">
        <div className="hud-tabs" role="tablist">
          {TOOLBAR_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={`hud-tab${section === s.id ? ' on' : ''}`}
              aria-selected={section === s.id}
              title={s.hint}
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="hud-panel" role="tabpanel" aria-label={TOOLBAR_SECTIONS.find((s) => s.id === section)?.label}>
        {sectionTools.length > 0 && (
          <div className="tools" role="toolbar" aria-label="Tools">
            {sectionTools.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tool-btn${tool === t.id ? ' on' : ''}`}
                onClick={() => pickTool(t.id)}
                title={t.tooltip}
                aria-pressed={tool === t.id}
              >
                <span className="tool-label">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {section === 'build' && (
          <div className="row hud-section-actions">
            <button
              type="button"
              className={snap ? 'on' : ''}
              aria-pressed={snap}
              title="Align new and moved objects to the grid (G)"
              onClick={() => useEditor.getState().set({ snap: !snap })}
            >
              {snap ? 'Align to Grid · On' : 'Align to Grid'}
            </button>
            <button
              type="button"
              className={tool === 'asset' ? 'on' : ''}
              aria-pressed={tool === 'asset'}
              title="Browse the object catalog in the side panel (8)"
              onClick={() => {
                openObjectLibrary()
                if (isCompact()) setMenuOpen(false)
              }}
            >
              Object library
            </button>
          </div>
        )}

        {section === 'edit' && (
          <div className="row hud-section-actions">
            <p className="hud-inline-hint">
              {selectedId ? 'Drag the selection to move it. Then rotate, resize, or remove.' : 'Select an object first — then drag to move, or use the actions below.'}
            </p>
            <button
              type="button"
              disabled={!selectedId}
              title={tooltip('Rotate left 15° (R with Shift)', noSelection)}
              onClick={() => editPaletteSelection('rotate-left')}
            >
              Rotate left
            </button>
            <button
              type="button"
              disabled={!selectedId}
              title={tooltip('Rotate right 15° (R)', noSelection)}
              onClick={() => editPaletteSelection('rotate-right')}
            >
              Rotate right
            </button>
            <button
              type="button"
              disabled={!selectedId}
              title={tooltip('Make taller (])', noSelection)}
              onClick={() => editPaletteSelection('raise')}
            >
              Taller
            </button>
            <button
              type="button"
              disabled={!selectedId}
              title={tooltip('Make shorter ([)', noSelection)}
              onClick={() => editPaletteSelection('lower')}
            >
              Shorter
            </button>
            <button
              type="button"
              disabled={!selectedId}
              title={tooltip('Duplicate selected object (D)', noSelection)}
              onClick={duplicateSelected}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="danger"
              disabled={!selectedId}
              title={tooltip('Delete selected object (Delete)', noSelection)}
              onClick={() => void onDelete()}
            >
              Delete
            </button>
            <button
              type="button"
              disabled={!hist.canUndo}
              title={tooltip('Undo last change (Ctrl+Z)', !hist.canUndo ? 'Nothing to undo' : undefined)}
              onClick={() => undo()}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!hist.canRedo}
              title={tooltip('Redo (Ctrl+Shift+Z)', !hist.canRedo ? 'Nothing to redo' : undefined)}
              onClick={() => redo()}
            >
              Redo
            </button>
          </div>
        )}

        {section === 'plan' && (
          <div className="hud-sim">
            <div className="row hud-section-actions">
              {route.playState === 'playing' ? (
                <button
                  type="button"
                  title="Pause the robot on its current path"
                  onClick={() => {
                    const r = pauseRoute()
                    setRouteMsg(r.ok ? 'Paused.' : r.error)
                  }}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={!route.waypoints.length}
                  title={tooltip('Play the waypoint route', !route.waypoints.length ? 'Add waypoints first' : undefined)}
                  onClick={() => {
                    const r = playRoute()
                    setRouteMsg(r.ok ? 'Playing route.' : r.error)
                  }}
                >
                  {route.playState === 'paused' ? 'Resume' : 'Play'}
                </button>
              )}
              <button
                type="button"
                disabled={route.playState !== 'playing' && route.playState !== 'paused'}
                title={tooltip('Stop and return to the first waypoint', route.playState === 'idle' || route.playState === 'done' ? 'Route is not running' : undefined)}
                onClick={() => {
                  stopRoute()
                  setRouteMsg('Stopped.')
                }}
              >
                Stop
              </button>
              <button
                type="button"
                disabled={route.playState !== 'playing' && route.playState !== 'paused'}
                title={tooltip('Skip to the next waypoint', route.playState === 'idle' || route.playState === 'done' ? 'Play the route first' : undefined)}
                onClick={() => {
                  const r = skipToNextWaypoint()
                  setRouteMsg(r.ok ? 'Skipped to next stop.' : r.error)
                }}
              >
                Next Stop
              </button>
              <button
                type="button"
                disabled={!route.waypoints.length || route.playState === 'playing' || route.playState === 'paused'}
                title={tooltip('Remove the last waypoint', !route.waypoints.length ? 'No waypoints' : route.playState === 'playing' || route.playState === 'paused' ? 'Stop the route first' : undefined)}
                onClick={() => {
                  const r = removeLastWaypoint()
                  setRouteMsg(r.ok ? 'Removed last waypoint.' : r.error)
                }}
              >
                Remove Last
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!route.waypoints.length}
                title={tooltip('Clear all waypoints', !route.waypoints.length ? 'No waypoints' : undefined)}
                onClick={() => {
                  clearRoute()
                  setRouteMsg('Route cleared.')
                }}
              >
                Clear Route
              </button>
              <button type="button" title="Slide a wall across the robot path to demo replanning (B)" onClick={blockRoute}>
                Block Path
              </button>
            </div>
            <div className="hud-sim-status">
              <strong>{routeStatusLabel(route)}</strong>
              <span>
                Robot: {robotStatusLine(status, replans)}
              </span>
              {routeMsg ? <span>{routeMsg}</span> : null}
            </div>
            <p className="hud-inline-hint">
              Use Add Waypoint and tap several points on the ground, then Play. Drag objects anytime to see the route change.
            </p>
          </div>
        )}

        {section === 'simulate' && (
          <div className="hud-sim">
            <div className="row hud-section-actions">
              {!attendee.running || attendee.phase === 'done' ? (
                <button
                  type="button"
                  className="primary"
                  title="Start the virtual attendee walkthrough (Entrance → Exit)"
                  onClick={() => {
                    resetAttendeeSimulation()
                    startAttendeeSimulation()
                  }}
                >
                  Start
                </button>
              ) : attendee.paused ? (
                <button type="button" className="primary" title="Resume the attendee simulation" onClick={() => resumeAttendeeSimulation()}>
                  Resume
                </button>
              ) : (
                <button type="button" title="Pause the attendee simulation" onClick={() => pauseAttendeeSimulation()}>
                  Pause
                </button>
              )}
              <button
                type="button"
                disabled={!attendee.running && attendee.phase === 'idle'}
                title={tooltip(
                  'Reset the attendee simulation',
                  !attendee.running && attendee.phase === 'idle' ? 'Simulation is already idle' : undefined,
                )}
                onClick={() => resetAttendeeSimulation()}
              >
                Reset Simulation
              </button>
            </div>
            <div className="hud-sim-status">
              <strong>{PHASE_LABEL[attendee.phase] ?? attendee.phase}</strong>
              <span>{attendee.task}</span>
              {attendee.destinationLabel ? <span>→ {attendee.destinationLabel}</span> : null}
              <span>
                Step {attendee.stepIndex + 1} · replans {attendee.replanCount}
              </span>
            </div>
            <p className="hud-inline-hint">Robot: {robotStatusLine(status, replans)}</p>
          </div>
        )}

        {section === 'view' && (
          <div className="row hud-section-actions">
            <label className="field" title="How large the world appears in your room">
              World scale
              <select value={worldScale} onChange={(e) => useEditor.getState().set({ worldScale: e.target.value as ScaleId })}>
                {SCALE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {SCALE_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={surface === 'real' ? 'on' : ''}
              aria-pressed={surface === 'real'}
              title="Real floor: transparent grid over your table or floor. Virtual: solid placeholder ground (V)"
              onClick={toggleSurface}
            >
              {surface === 'real' ? 'Floor: Real' : 'Floor: Virtual'}
            </button>
            <button
              type="button"
              className={rays ? 'on' : ''}
              aria-pressed={rays}
              title="See through objects with XR pointer rays on hands and controllers (X)"
              onClick={toggleRays}
            >
              {rays ? 'See Through · On' : 'See Through Objects'}
            </button>
            <button
              type="button"
              className={mocap.enabled ? 'on' : ''}
              aria-pressed={mocap.enabled}
              title="Optional Smartsuit Pro live skeleton overlay"
              onClick={toggleMocap}
            >
              Motion Capture
            </button>
            <button
              type="button"
              className={occlusion ? 'on' : ''}
              aria-pressed={occlusion}
              title="Hide virtual objects behind real ones: Quest 3/3S live depth, else your Space Setup room (O)"
              onClick={toggleOcclusion}
            >
              {occlusion ? 'Hide Behind Real · On' : 'Hide Behind Real'}
            </button>
            <button
              type="button"
              className={realSurfaces ? 'on' : ''}
              aria-pressed={realSurfaces}
              title="Objects rest on real tables and stop at real walls and furniture (needs Space Setup; not at Miniature View) (P)"
              onClick={toggleRealSurfaces}
            >
              {realSurfaces ? 'Real Surfaces · On' : 'Real Surfaces'}
            </button>
            <button
              type="button"
              className={snap ? 'on' : ''}
              aria-pressed={snap}
              title="Align placement to the grid (G)"
              onClick={() => useEditor.getState().set({ snap: !snap })}
            >
              {snap ? 'Align to Grid · On' : 'Align to Grid'}
            </button>
          </div>
        )}

        {section === 'save' && (
          <div className="row hud-section-actions">
            <button type="button" className="primary" title="Save the current world (Ctrl+S)" onClick={() => void onSave()}>
              Save World
            </button>
            <button type="button" title="Browse, load, and manage saved worlds (L)" onClick={openWorldLibrary}>
              Load World
            </button>
            <button type="button" title="Import a .realmforge.json world file" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void onImportFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button type="button" title="Download the current world as JSON" onClick={onExport}>
              Export
            </button>
            <button type="button" className="ghost danger" title="Clear all objects and reset the board" onClick={() => void onClearWorld()}>
              Clear World
            </button>
            {saveMsg && <span className="hud-inline-hint">{saveMsg}</span>}
          </div>
        )}
      </div>

      {xrError && (
        <div className="alert" role="alert">
          {xrError}
        </div>
      )}
      {placement === 'choosing' && <p className="hint-banner">Point at a table or floor to place the world.</p>}
      {mocap.enabled && mocap.status === 'error' && (
        <div className="alert" role="alert">
          {mocap.error}
        </div>
      )}
      <div className="help">
        <button
          type="button"
          className="help-toggle"
          aria-expanded={guideOpen}
          onClick={() => (guideOpen ? closeGuide() : openGuide('start'))}
        >
          Open user &amp; controls guide
        </button>
        <p className="hint-banner" style={{ marginTop: 8 }}>
          In VR: wrist <strong>Guide</strong> or panel <strong>Guide</strong> — same help in headset.
        </p>
        <p>Right-click for world actions. Middle-drag pans.</p>
      </div>
      </div>
    </div>
  )
}
