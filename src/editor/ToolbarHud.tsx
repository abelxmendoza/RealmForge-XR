/**
 * Desktop HUD: six primary sections (Build / Edit / Plan Routes / Simulate / View / Save).
 * Preserves existing actions and keyboard shortcuts; shortcuts appear in tooltips only.
 */
import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'
import { worldActions } from '../world/actions'
import { confirmReplace, requestConfirmation } from '../world/confirmation'
import { enterARWithFallback, useXRSessionMeta } from '../xr/session'
import { usePlacement } from '../xr/placement'
import { useWorld } from '../world/store'
import { useNav } from '../nav/navigation'
import { blockRoute } from './demo'
import { openWorldLibrary } from './WorldLibrary'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { useEditor } from './settings'
import { downloadWorld, importWorld, quickSave, useWorldLibrary } from '../world/persistence'
import { redo, undo, subscribeHistory } from '../world/history'
import { toggleRays, toggleSurface } from './xrInput'
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
import { xrStore } from '../xr/xrStore'

const STATUS_TEXT = {
  idle: 'No goal set',
  moving: 'Robot moving',
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

function tooltip(base: string, disabledWhy?: string) {
  return disabledWhy ? `${base} — ${disabledWhy}` : base
}

export function ToolbarHud() {
  const tool = useWorld((s) => s.tool)
  const setTool = worldActions.setTool
  const selectedId = useWorld((s) => s.selectedId)
  const status = useNav((s) => s.status)
  const replans = useNav((s) => s.replanCount)
  const snap = useEditor((s) => s.snap)
  const placement = usePlacement((s) => s.status)
  const xrError = useXRSessionMeta((s) => s.lastError)
  const entering = useXRSessionMeta((s) => s.entering)
  const dirty = useWorldLibrary((s) => s.dirty)
  const worldScale = useEditor((s) => s.worldScale)
  const rays = useEditor((s) => s.rays)
  const surface = useEditor((s) => s.surface)
  const mocap = useMocap()
  const attendee = useAttendee()
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [section, setSection] = useState<ToolbarSection>('build')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])

  // Follow placement / route tools into their section when the keyboard picks them (1–0).
  // Leave "Move" (select) alone so first-time users stay on Build until they choose.
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
    <div className="hud">
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
        <div className="hud-session">
          <button
            type="button"
            className="primary"
            disabled={entering}
            title="Enter immersive mode — AR when available, otherwise VR"
            onClick={() => void enterARWithFallback()}
          >
            {entering ? 'Entering…' : 'Enter XR'}
          </button>
          <button
            type="button"
            className="ghost hud-vr-alt"
            title="VR only — no camera passthrough. Prefer Enter XR on Quest."
            onClick={() => void xrStore.enterVR()}
          >
            VR
          </button>
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
                onClick={() => setTool(t.id)}
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
            <button type="button" title="Open the worlds library for templates and catalogs (L)" onClick={openWorldLibrary}>
              Object library
            </button>
          </div>
        )}

        {section === 'edit' && (
          <div className="row hud-section-actions">
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
          <div className="row hud-section-actions">
            <button type="button" title="Slide a wall across the robot path to demo replanning (B)" onClick={blockRoute}>
              Block Path
            </button>
            <p className="hud-inline-hint">Set a destination, then watch the robot find a path. Block Path tests replanning.</p>
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
            <p className="hud-inline-hint">Robot: {STATUS_TEXT[status]} · replans {replans}</p>
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

      <div className="status" role="status">
        <span className={`status-dot${statusTone ? ` ${statusTone}` : ''}`} aria-hidden />
        <span>
          {STATUS_TEXT[status]} · replans {replans}
          {dirty ? ' · unsaved' : ''}
          {mocap.enabled && ` · motion capture ${mocap.status}${mocap.status === 'live' ? ` ${mocap.fps} fps` : ''}`}
        </span>
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
  )
}
