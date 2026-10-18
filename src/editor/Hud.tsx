import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../theme/brand'
import { worldActions } from '../world/actions'
import { confirmReplace } from '../world/confirmation'
import { enterARWithFallback, useXRSessionMeta } from '../xr/session'
import { usePlacement } from '../xr/placement'
import { useWorld } from '../world/store'
import { useNav } from '../nav/navigation'
import { blockRoute } from './demo'
import { EnvironmentsMenu } from './EnvironmentsMenu'
import { deleteSelected, duplicateSelected } from './Obstacles'
import { useEditor } from './settings'
import { useWorldLibrary } from '../world/persistence'
import { redo, undo, subscribeHistory } from '../world/history'
import { toggleRays, toggleSurface } from './xrInput'
import { toggleMocap, useMocap } from '../mocap/store'
import { SCALE_IDS, type ScaleId } from '../scene/worldRoot'
import { useGuide } from '../guide/guideStore'
import { xrStore } from '../xr/xrStore'
import { HOME_HREF, leaveEditor } from './leaveEditor'
import { openWorldLibrary } from './WorldLibrary'
import {
  pauseAttendeeSimulation,
  resetAttendeeSimulation,
  resumeAttendeeSimulation,
  startAttendeeSimulation,
  useAttendee,
} from '../sim/attendee'
import {
  isWorldsMenuBusy,
  menuDownloadWorld,
  menuImportWorld,
  menuQuickSave,
  menuSaveWorld,
  type WorldsMenuFeedback,
} from './worldsMenuController'
import {
  BUILD_TOOLS,
  EDIT_TOOLS,
  HUD_SECTIONS,
  PLAN_TOOLS,
  SCALE_LABELS,
  type HudSectionId,
} from './hudTools'

const STATUS_TEXT = {
  idle: 'No destination set',
  moving: 'Robot moving',
  arrived: 'Arrived',
  'no-path': 'No path to destination',
} as const

function tip(base: string, shortcut?: string) {
  return shortcut ? `${base} (${shortcut})` : base
}

function disabledTip(reason: string) {
  return reason
}

/**
 * Desktop / Quest Browser HUD: six clear sections so first-time users can find actions
 * without reading keyboard abbreviations. Shortcuts stay in tooltips only.
 */
export function Hud() {
  const tool = useWorld((s) => s.tool)
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
  const sim = useAttendee()
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [section, setSection] = useState<HudSectionId>('build')
  const [saveFeedback, setSaveFeedback] = useState<WorldsMenuFeedback>({ kind: 'idle' })
  const [worldName, setWorldName] = useState(() => useWorldLibrary.getState().activeName)
  const fileInput = useRef<HTMLInputElement>(null)
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  const activeName = useWorldLibrary((s) => s.activeName)
  const saveBusy = saveFeedback.kind === 'busy' || isWorldsMenuBusy()

  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])
  useEffect(() => setWorldName(activeName), [activeName])

  const statusTone =
    status === 'moving' || mocap.status === 'live' ? 'live' : status === 'no-path' || mocap.status === 'error' ? 'warn' : ''
  const hasSelection = Boolean(selectedId)
  const sectionMeta = HUD_SECTIONS.find((s) => s.id === section)!

  return (
    <div className="hud">
      <div className="hud-brand">
        <a
          className="editor-home"
          href={HOME_HREF}
          title="Back to the project page"
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
            title={
              placement === 'choosing'
                ? 'Cancel placing the world'
                : 'Pin the world onto a real table or floor (AR)'
            }
            onClick={() => {
              const p = usePlacement.getState()
              if (p.status === 'choosing') p.cancelChoosing()
              else p.startChoosing()
            }}
          >
            {placement === 'choosing' ? 'Cancel Place' : 'Place World'}
          </button>
          {placement === 'pinned' && (
            <button type="button" className="ghost" title="Unpin the world from the table or floor" onClick={() => usePlacement.getState().resetToDefault()}>
              Unpin World
            </button>
          )}
          <button
            type="button"
            className={guideOpen ? 'on' : 'primary'}
            aria-pressed={guideOpen}
            title={tip('Open the user & controls guide', '?')}
            onClick={() => (guideOpen ? closeGuide() : openGuide('start'))}
          >
            Guide
          </button>
        </div>
      </div>

      <nav className="hud-nav" aria-label="Editor sections">
        {HUD_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? 'on' : ''}
            aria-pressed={section === s.id}
            title={s.hint}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="hud-panel hud-section" role="region" aria-label={sectionMeta.label}>
        <p className="hud-section-hint">{sectionMeta.hint}</p>

        {section === 'build' && (
          <>
            <div className="tools" role="toolbar" aria-label="Build tools">
              {BUILD_TOOLS.map((t) => (
                <ToolButton key={t.id} id={t.id} label={t.label} tooltip={t.tooltip} active={tool === t.id} onSelect={worldActions.setTool} />
              ))}
            </div>
            <div className="row hud-section-actions">
              <ToggleButton
                active={snap}
                label={snap ? 'Align to Grid: On' : 'Align to Grid: Off'}
                title={tip('Snap new objects and moves to the map grid', 'G')}
                onClick={() => useEditor.getState().set({ snap: !snap })}
              />
            </div>
            <EnvironmentsMenu compact />
            <p className="hint">Templates replace the current world (asks first). Pick a catalog item in the right panel, then place it here.</p>
          </>
        )}

        {section === 'edit' && (
          <>
            <div className="tools" role="toolbar" aria-label="Edit tools">
              {EDIT_TOOLS.map((t) => (
                <ToolButton key={t.id} id={t.id} label={t.label} tooltip={t.tooltip} active={tool === t.id} onSelect={worldActions.setTool} />
              ))}
            </div>
            <div className="row hud-section-actions">
              <button
                type="button"
                disabled={!hasSelection}
                title={hasSelection ? tip('Make a copy of the selected object', 'D') : disabledTip('Select an object first')}
                onClick={duplicateSelected}
              >
                Duplicate
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                title={hasSelection ? tip('Delete the selected object', 'Delete') : disabledTip('Select an object first')}
                onClick={deleteSelected}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                title={hasSelection ? tip('Rotate the selection 15°', 'R') : disabledTip('Select an object first')}
                onClick={() => {
                  const w = useWorld.getState()
                  const sel = w.selectedId ? w.objects[w.selectedId] : null
                  if (sel) w.updateObject(sel.id, { rotationY: sel.rotationY + Math.PI / 12 })
                }}
              >
                Rotate
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                title={hasSelection ? tip('Make the selection taller', ']') : disabledTip('Select an object first')}
                onClick={() => {
                  const w = useWorld.getState()
                  const sel = w.selectedId ? w.objects[w.selectedId] : null
                  if (sel) w.updateObject(sel.id, { size: [sel.size[0], sel.size[1] + 0.5, sel.size[2]] })
                }}
              >
                Taller
              </button>
              <button
                type="button"
                disabled={!hasSelection}
                title={hasSelection ? tip('Make the selection shorter', '[') : disabledTip('Select an object first')}
                onClick={() => {
                  const w = useWorld.getState()
                  const sel = w.selectedId ? w.objects[w.selectedId] : null
                  if (sel) w.updateObject(sel.id, { size: [sel.size[0], Math.max(0.3, sel.size[1] - 0.5), sel.size[2]] })
                }}
              >
                Shorter
              </button>
              <button
                type="button"
                disabled={!hist.canUndo}
                title={hist.canUndo ? tip('Undo the last change', 'Ctrl+Z') : disabledTip('Nothing to undo yet')}
                onClick={() => undo()}
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!hist.canRedo}
                title={hist.canRedo ? tip('Redo the last undone change', 'Ctrl+Shift+Z') : disabledTip('Nothing to redo')}
                onClick={() => redo()}
              >
                Redo
              </button>
              <button
                type="button"
                className="ghost danger-action"
                title="Remove everything and start from an empty world"
                onClick={async () => {
                  if (await confirmReplace('Clear the current world and start empty?')) {
                    useWorld.getState().reset()
                  }
                }}
              >
                Clear World
              </button>
            </div>
            <p className="hint">{hasSelection ? 'Use the right inspector for exact size and materials.' : 'Select an object in the scene to edit it.'}</p>
          </>
        )}

        {section === 'plan' && (
          <>
            <div className="tools" role="toolbar" aria-label="Route planning tools">
              {PLAN_TOOLS.map((t) => (
                <ToolButton key={t.id} id={t.id} label={t.label} tooltip={t.tooltip} active={tool === t.id} onSelect={worldActions.setTool} />
              ))}
            </div>
            <div className="row hud-section-actions">
              <button type="button" title={tip('Drop a wall across the robot’s current path (demo)', 'B')} onClick={blockRoute}>
                Block Path
              </button>
            </div>
            <p className="hint">
              Place the robot, set a destination, then watch it find a path. Block Path is a quick demo obstacle — not a freehand path drawer.
            </p>
          </>
        )}

        {section === 'simulate' && (
          <>
            <div className="row hud-section-actions">
              {!sim.running || sim.phase === 'done' ? (
                <button
                  type="button"
                  className="primary"
                  title="Start the event attendee walking Entrance → Registration → Booths → Exit"
                  onClick={() => {
                    resetAttendeeSimulation()
                    startAttendeeSimulation()
                  }}
                >
                  Start Simulation
                </button>
              ) : sim.paused ? (
                <button type="button" className="primary" title="Resume the paused attendee" onClick={() => resumeAttendeeSimulation()}>
                  Resume
                </button>
              ) : (
                <button type="button" title="Pause the attendee where they are" onClick={() => pauseAttendeeSimulation()}>
                  Pause
                </button>
              )}
              <button
                type="button"
                disabled={!sim.running && sim.phase === 'idle'}
                title={
                  !sim.running && sim.phase === 'idle'
                    ? disabledTip('Simulation is already idle')
                    : 'Stop the attendee and clear their progress'
                }
                onClick={() => resetAttendeeSimulation()}
              >
                Reset Simulation
              </button>
            </div>
            <p className="hint">
              Phase: <strong>{sim.phase}</strong>
              {sim.task ? ` · ${sim.task}` : ''}
              {sim.destinationLabel ? ` · Going to ${sim.destinationLabel}` : ''}
            </p>
            <p className="hint">Planning preview only — not a crowd or egress model. The robot path always shows in the scene when a destination is set.</p>
          </>
        )}

        {section === 'view' && (
          <div className="row hud-section-actions">
            <label className="field" title={SCALE_LABELS[worldScale]?.tooltip}>
              World scale
              <select
                value={worldScale}
                aria-label="World scale"
                onChange={(e) => useEditor.getState().set({ worldScale: e.target.value as ScaleId })}
              >
                {SCALE_IDS.map((id) => (
                  <option key={id} value={id} title={SCALE_LABELS[id]?.tooltip}>
                    {SCALE_LABELS[id]?.label ?? id}
                  </option>
                ))}
              </select>
            </label>
            <ToggleButton
              active={surface === 'real'}
              label={surface === 'real' ? 'Floor: Your Room' : 'Floor: Virtual'}
              title={tip(
                surface === 'real'
                  ? 'Transparent grid over your real floor or table (passthrough shows through)'
                  : 'Solid placeholder ground drawn in the scene',
                'V',
              )}
              onClick={toggleSurface}
            />
            <ToggleButton
              active={rays}
              label={rays ? 'Pointer Rays: On' : 'Pointer Rays: Off'}
              title={tip('Show aim beams from hands and controllers in XR', 'X')}
              onClick={toggleRays}
            />
            <ToggleButton
              active={mocap.enabled}
              label={mocap.enabled ? 'Motion Capture: On' : 'Motion Capture: Off'}
              title="Optional Smartsuit Pro live skeleton overlay"
              onClick={toggleMocap}
            />
          </div>
        )}

        {section === 'save' && (
          <>
            <label className="field hud-save-name">
              World name
              <input
                type="text"
                value={worldName}
                maxLength={80}
                disabled={saveBusy}
                onChange={(e) => setWorldName(e.target.value)}
                title="Name used when you save"
              />
            </label>
            <div className="row hud-section-actions">
              <button
                type="button"
                className="primary"
                disabled={saveBusy}
                title={tip('Save this world to your browser library', 'Ctrl+S')}
                onClick={() => {
                  setSaveFeedback({ kind: 'busy', action: 'Save' })
                  void menuQuickSave(worldName).then(({ feedback }) => setSaveFeedback(feedback))
                }}
              >
                Save World
              </button>
              <button
                type="button"
                disabled={saveBusy}
                title="Save a new copy under this name"
                onClick={() => {
                  setSaveFeedback({ kind: 'busy', action: 'Save' })
                  void menuSaveWorld(worldName).then(({ feedback }) => setSaveFeedback(feedback))
                }}
              >
                Save as New
              </button>
              <button
                type="button"
                disabled={saveBusy}
                title="Download a JSON file of this world"
                onClick={() => {
                  setSaveFeedback({ kind: 'busy', action: 'Export' })
                  void menuDownloadWorld(worldName).then(({ feedback }) => setSaveFeedback(feedback))
                }}
              >
                Export
              </button>
              <button
                type="button"
                disabled={saveBusy}
                title="Import a previously exported JSON world"
                onClick={() => fileInput.current?.click()}
              >
                Import
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  setSaveFeedback({ kind: 'busy', action: 'Import' })
                  setSaveFeedback((await menuImportWorld(f, confirmReplace)).feedback)
                }}
              />
            </div>
            <div className="row">
              <button type="button" title="Open the full worlds library (L)" onClick={openWorldLibrary}>
                Worlds Library
              </button>
            </div>
            {saveFeedback.kind === 'ok' && <p className="hint toast">{saveFeedback.message}</p>}
            {saveFeedback.kind === 'error' && <p className="hint toast-err">{saveFeedback.message}</p>}
            {saveFeedback.kind === 'cancelled' && <p className="hint">Cancelled.</p>}
            <p className="hint">Use Worlds Library for templates and saves. Drop a .json file anywhere to import.</p>
          </>
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
          title={tip('Open the user & controls guide', '?')}
          onClick={() => (guideOpen ? closeGuide() : openGuide('start'))}
        >
          Open user &amp; controls guide
        </button>
        <p className="hint-banner" style={{ marginTop: 8 }}>
          In VR: wrist <strong>Guide</strong> or panel <strong>Guide</strong> — same help in headset.
        </p>
        <p>Right-click for world actions. Middle-drag pans the view.</p>
      </div>
    </div>
  )
}

function ToolButton({
  id,
  label,
  tooltip,
  active,
  onSelect,
}: {
  id: Parameters<typeof worldActions.setTool>[0]
  label: string
  tooltip: string
  active: boolean
  onSelect: typeof worldActions.setTool
}) {
  return (
    <button
      type="button"
      className={`tool-btn${active ? ' on' : ''}`}
      onClick={() => onSelect(id)}
      title={tooltip}
      aria-pressed={active}
      aria-label={label}
    >
      <span className="tool-label">{label}</span>
      {active ? <span className="tool-state">Selected</span> : null}
    </button>
  )
}

function ToggleButton({
  active,
  label,
  title,
  onClick,
}: {
  active: boolean
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'on' : ''} aria-pressed={active} title={title} onClick={onClick}>
      {label}
    </button>
  )
}
