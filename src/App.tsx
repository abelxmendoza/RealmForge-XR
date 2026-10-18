import { ConfirmationDialog } from './editor/ConfirmationDialog'
import { ControlsGuide } from './editor/ControlsGuide'
import { VoicePanel } from './editor/VoicePanel'
import { useGuide } from './guide/guideStore'
import { worldActions } from './world/actions'
import { flowActions } from './flow/actions'
import { useFlow } from './flow/store'
import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import { Scene } from './scene/Scene'
import { useWorld } from './world/store'
import { blockRoute } from './editor/demo'
import { Inspector } from './editor/Inspector'
import { WorldLibrary } from './editor/WorldLibrary'
import { DesktopContextMenu } from './editor/DesktopContextMenu'
import { cycleSelected, deleteSelected, duplicateSelected } from './editor/Obstacles'
import { useEditor } from './editor/settings'
import { importWorld, quickSave } from './world/persistence'
import { redo, undo } from './world/history'
import { toggleRays, toggleSurface } from './editor/xrInput'
import { toggleOcclusion } from './xr/occlusion'
import { toggleRealSurfaces } from './xr/realSurfaces'
import { toolByKey } from './editor/toolbar'
import { ToolbarHud } from './editor/ToolbarHud'
import { xrStore } from './xr/xrStore'

export { xrStore }

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
      <ToolbarHud />
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
      if (e.key === 'Enter' && useFlow.getState().draft) {
        e.preventDefault()
        flowActions.finishRoute()
        return
      }
      if (e.key === 'Escape' && useFlow.getState().draft) {
        e.preventDefault()
        flowActions.cancelRoute()
        return
      }
      const tool = toolByKey(e.key)
      if (tool) {
        if (tool.id === 'route') flowActions.beginRoute('waypoint')
        else worldActions.setTool(tool.id)
        return
      }
      if (e.key === 'b' || e.key === 'B') return blockRoute()
      if (e.key === 'g' || e.key === 'G') return useEditor.getState().set({ snap: !useEditor.getState().snap })
      if (e.key === 'x' || e.key === 'X') return toggleRays()
      if (e.key === 'v' || e.key === 'V') return toggleSurface()
      if (e.key === 'o' || e.key === 'O') return toggleOcclusion()
      if (e.key === 'p' || e.key === 'P') return toggleRealSurfaces()
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
      if (!sel) {
        if (e.key === 'Escape') w.select(null)
        return
      }
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
