import { BRAND } from './theme/brand'
import { ConfirmationDialog } from './editor/ConfirmationDialog'
import { ControlsGuide } from './editor/ControlsGuide'
import { VoicePanel } from './editor/VoicePanel'
import { useGuide } from './guide/guideStore'
import { worldActions } from './world/actions'
import { confirmReplace } from './world/confirmation'
import { enterARWithFallback, useXRSessionMeta } from './xr/session'
import { usePlacement } from './xr/placement'
import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { Scene } from './scene/Scene'
import { useWorld, type Tool } from './world/store'
import { useNav } from './nav/navigation'
import { blockRoute } from './editor/demo'
import { Inspector } from './editor/Inspector'
import { WorldLibrary, openWorldLibrary } from './editor/WorldLibrary'
import { DesktopContextMenu } from './editor/DesktopContextMenu'
import { cycleSelected, deleteSelected, duplicateSelected } from './editor/Obstacles'
import { useEditor } from './editor/settings'
import { importWorld, quickSave, useWorldLibrary } from './world/persistence'
import { redo, undo, subscribeHistory } from './world/history'
import { bindRays, toggleRays, toggleSurface } from './editor/xrInput'
import { toggleMocap, useMocap } from './mocap/store'
import { SCALE_IDS, SCALE_PRESETS, type ScaleId } from './scene/worldRoot'
import { HOME_HREF, leaveEditor } from './editor/leaveEditor'

/**
 * By default no rays in XR: objects are grabbed directly. Hands keep grab + touch pointers;
 * controllers keep grab. Rays can be switched on (HUD, X key, wrist menu).
 * offerSession:false — Enter AR uses enterARWithFallback (depth/plane/anchor chain).
 */
export const xrStore = createXRStore({
  offerSession: false,
  hand: { rayPointer: useEditor.getState().rays },
  controller: { rayPointer: useEditor.getState().rays },
})
bindRays(xrStore)

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select / move', key: '1' },
  { id: 'wall', label: 'Draw wall', key: '2' },
  { id: 'building', label: 'Building', key: '3' },
  { id: 'goal', label: 'Set goal', key: '4' },
  { id: 'robot', label: 'Place robot', key: '5' },
  { id: 'platform', label: 'Platform / road', key: '6' },
  { id: 'decor', label: 'Decoration', key: '7' },
  { id: 'asset', label: 'Catalog object', key: '8' },
  { id: 'actor', label: 'Actor', key: '9' },
  { id: 'event', label: 'Event object', key: '0' },
]

const STATUS_TEXT = {
  idle: 'No goal set',
  moving: 'Robot moving',
  arrived: 'Arrived',
  'no-path': 'No route to goal',
} as const

export default function App() {
  useKeyboard()
  useJsonFileDrop()
  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 2.0, 0.2], fov: 50 }}>
        <XR store={xrStore}>
          <Scene />
        </XR>
      </Canvas>
      <Hud />
      <Inspector />
      <WorldLibrary />
      <VoicePanel />
      <ControlsGuide />
      {/* DOM confirm works in Quest Browser WebXR; required so wrist-menu env loads can confirm. */}
      <ConfirmationDialog />
      <DesktopContextMenu />
    </>
  )
}

/** Drop a `.realmforge.json` / `.json` world file anywhere on the page to import it. */
function useJsonFileDrop() {
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files
      if (!files?.length) return
      const file = [...files].find((f) => /\.json$/i.test(f.name) || f.type === 'application/json')
      if (!file) return
      e.preventDefault()
      const r = await importWorld(file)
      if (!r.ok && !r.cancelled) console.warn('[RealmForge] import drop failed:', r.error)
      else if (r.ok) console.log('[RealmForge] imported', file.name, r.warnings)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
}

function Hud() {
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
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const guideOpen = useGuide((s) => s.open)
  const openGuide = useGuide((s) => s.openGuide)
  const closeGuide = useGuide((s) => s.closeGuide)
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])
  const statusTone = status === 'moving' || mocap.status === 'live' ? 'live' : status === 'no-path' || mocap.status === 'error' ? 'warn' : ''
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

      <div className="hud-panel">
        <div className="tools" role="toolbar" aria-label="Worldbuilding tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tool-btn${tool === t.id ? ' on' : ''}`}
              onClick={() => setTool(t.id)}
              title={`Key ${t.key}`}
              aria-pressed={tool === t.id}
            >
              <span className="tool-key">{t.key}</span>
              <span className="tool-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" onClick={openWorldLibrary}>Worlds library (L)</button>

      <div className="hud-panel">
        <div className="row">
          <button type="button" onClick={blockRoute}>
            B Block route
          </button>
          <button type="button" disabled={!selectedId} onClick={duplicateSelected}>
            D Duplicate
          </button>
          <button type="button" disabled={!selectedId} onClick={deleteSelected}>
            Del Delete
          </button>
          <button type="button" className={snap ? 'on' : ''} onClick={() => useEditor.getState().set({ snap: !snap })}>
            G Snap
          </button>
          <button type="button" disabled={!hist.canUndo} onClick={() => undo()} title="Ctrl+Z">
            Undo
          </button>
          <button type="button" disabled={!hist.canRedo} onClick={() => redo()} title="Ctrl+Shift+Z">
            Redo
          </button>
          <button type="button" className={rays ? 'on' : ''} onClick={toggleRays} title="XR pointer rays on hands and controllers">
            X Rays
          </button>
          <button
            type="button"
            className={surface === 'real' ? 'on' : ''}
            onClick={toggleSurface}
            title="Real: transparent grid over your floor or table. Virtual: solid placeholder ground"
          >
            V Surface: {surface === 'real' ? 'Real' : 'Virtual'}
          </button>
          <button type="button" className={mocap.enabled ? 'on' : ''} onClick={toggleMocap} title="Smartsuit Pro live skeleton (optional)">
            Mocap
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              if (await confirmReplace('Reset the current world?')) useWorld.getState().reset()
            }}
          >
            Reset
          </button>
          <label className="field">
            Scale
            <select value={worldScale} onChange={(e) => useEditor.getState().set({ worldScale: e.target.value as ScaleId })}>
              {SCALE_IDS.map((id) => (
                <option key={id} value={id}>
                  {SCALE_PRESETS[id].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="status" role="status">
        <span className={`status-dot${statusTone ? ` ${statusTone}` : ''}`} aria-hidden />
        <span>
          {STATUS_TEXT[status]} · replans {replans}
          {dirty ? ' · unsaved' : ''}
          {mocap.enabled && ` · mocap ${mocap.status}${mocap.status === 'live' ? ` ${mocap.fps} fps` : ''}`}
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

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return

      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void quickSave().then((r) => {
          if (!r.ok && !r.cancelled) console.warn('[RealmForge] save failed:', r.error)
        })
        return
      }
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        redo()
        return
      }

      const w = useWorld.getState()
      const tool = TOOLS.find((t) => t.key === e.key)
      if (tool) return worldActions.setTool(tool.id)
      if (e.key === 'b' || e.key === 'B') return blockRoute()
      if (e.key === 'g' || e.key === 'G') return useEditor.getState().set({ snap: !useEditor.getState().snap })
      if (e.key === 'x' || e.key === 'X') return toggleRays()
      if (e.key === 'v' || e.key === 'V') return toggleSurface()
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        useGuide.getState().toggleGuide()
        return
      }
      if (w.tool === 'asset' && (e.key === 'r' || e.key === 'R')) {
        worldActions.rotateCatalogAsset(e.shiftKey ? -1 : 1)
        return
      }
      const sel = w.selectedId ? w.objects[w.selectedId] : null
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
      else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        duplicateSelected()
      } else if (e.key === 'm' || e.key === 'M') cycleSelected()
      else if ((e.key === 't' || e.key === 'T') && sel.kind === 'building')
        w.updateObject(sel.id, { roof: (sel.roof ?? (sel.style === 'house' ? 'pitched' : 'flat')) === 'pitched' ? 'flat' : 'pitched' })
      else if (e.key === 'r' || e.key === 'R') w.updateObject(sel.id, { rotationY: sel.rotationY + (e.shiftKey ? -1 : 1) * (Math.PI / 12) })
      else if (e.key === ']') w.updateObject(sel.id, { size: [sel.size[0], sel.size[1] + 0.5, sel.size[2]] })
      else if (e.key === '[') w.updateObject(sel.id, { size: [sel.size[0], Math.max(0.3, sel.size[1] - 0.5), sel.size[2]] })
      else if (e.key === 'Escape') w.select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
