import { ConfirmationDialog } from './editor/ConfirmationDialog'
import { VoicePanel } from './editor/VoicePanel'
import { worldActions } from './world/actions'
import { confirmReplace } from './world/confirmation'
import { enterARWithFallback, useXRSessionMeta } from './xr/session'
import { usePlacement } from './xr/placement'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { Scene } from './scene/Scene'
import { useWorld, type Tool } from './world/store'
import { useNav } from './nav/navigation'
import { blockRoute } from './editor/demo'
import { Inspector } from './editor/Inspector'
import { cycleSelected, deleteSelected, duplicateSelected } from './editor/Obstacles'
import { useEditor } from './editor/settings'
import { importWorld, quickSave, useWorldLibrary } from './world/persistence'
import { redo, undo, subscribeHistory } from './world/history'

/** Hands and controllers both emit the same pointer events, so the editor doesn't care which is used. */
export const xrStore = createXRStore({ offerSession: false, depthSensing: false, planeDetection: true, anchors: true, meshDetection: true, hitTest: true, handTracking: true })

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select / move', key: '1' },
  { id: 'wall', label: 'Draw wall', key: '2' },
  { id: 'building', label: 'Building', key: '3' },
  { id: 'goal', label: 'Set goal', key: '4' },
  { id: 'robot', label: 'Place robot', key: '5' },
  { id: 'platform', label: 'Platform / road', key: '6' },
  { id: 'decor', label: 'Decoration', key: '7' },
]

const STATUS_TEXT = {
  idle: 'No goal set',
  moving: 'Robot moving',
  arrived: 'Arrived',
  'no-path': 'No route to goal',
} as const

export default function App() {
  const immersive = useSyncExternalStore(xrStore.subscribe, () => xrStore.getState().session != null)
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
      <VoicePanel />
      {!immersive && <ConfirmationDialog />}
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
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  useEffect(() => subscribeHistory((s) => setHist({ canUndo: s.canUndo, canRedo: s.canRedo })), [])
  return (
    <div className="hud">
      <div className="row">
        <strong>
          RealmForge XR
          {dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
        </strong>
        <button disabled={entering} onClick={() => void enterARWithFallback()}>
          Enter AR
        </button>
        <button
          onClick={() => {
            const p = usePlacement.getState()
            if (p.status === 'choosing') p.cancelChoosing()
            else p.startChoosing()
          }}
        >
          {placement === 'choosing' ? 'Cancel place' : 'Place city'}
        </button>
        {placement === 'pinned' && <button onClick={() => usePlacement.getState().resetToDefault()}>Unpin</button>}
        <button onClick={() => xrStore.enterVR()}>Enter VR</button>
      </div>
      <div className="row">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)} title={`Key ${t.key}`}>
            {t.key} {t.label}
          </button>
        ))}
      </div>
      <div className="row">
        <button onClick={blockRoute}>B Block route</button>
        <button disabled={!selectedId} onClick={duplicateSelected}>
          D Duplicate
        </button>
        <button disabled={!selectedId} onClick={deleteSelected}>
          Del Delete
        </button>
        <button className={snap ? 'on' : ''} onClick={() => useEditor.getState().set({ snap: !snap })}>
          G Snap
        </button>
        <button disabled={!hist.canUndo} onClick={() => undo()} title="Ctrl+Z">
          Undo
        </button>
        <button disabled={!hist.canRedo} onClick={() => redo()} title="Ctrl+Shift+Z">
          Redo
        </button>
        <button onClick={async () => { if (await confirmReplace('Reset the current world?')) useWorld.getState().reset() }}>Reset</button>
      </div>
      <div className="status">
        {STATUS_TEXT[status]} · replans {replans}
        {dirty ? ' · unsaved' : ''}
      </div>
      {xrError && <div role="alert">{xrError}</div>}
      {placement === 'choosing' && <p>Point at a table or floor to place the world.</p>}
      <div className="help">
        Drag empty ground to orbit. Select: drag an object to move it, yellow handle resizes, blue handle rotates,
        green cube duplicates, purple cube changes style, red cube deletes.
        Keys: R rotate 15°, [ ] height, D duplicate, M material/style, T roof, G snap, Del delete.
        Ctrl+S save, Ctrl+Z / Ctrl+Shift+Z undo/redo. Drop a .json world file to import.
      </div>
    </div>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing into the inspector's fields must not trigger shortcuts.
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
      else if (e.key === ']') w.updateObject(sel.id, { size: [sel.size[0], sel.size[1] + 0.25, sel.size[2]] })
      else if (e.key === '[') w.updateObject(sel.id, { size: [sel.size[0], Math.max(0.3, sel.size[1] - 0.25), sel.size[2]] })
      else if (e.key === 'Escape') w.select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
