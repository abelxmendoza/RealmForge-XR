import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { Scene } from './scene/Scene'
import { useWorld, type Tool } from './world/store'
import { useNav } from './nav/navigation'
import { blockRoute } from './editor/demo'
import { Inspector } from './editor/Inspector'
import { cycleSelected, deleteSelected, duplicateSelected } from './editor/Obstacles'
import { useEditor } from './editor/settings'
import { bindRays, toggleRays } from './editor/xrInput'
import { toggleMocap, useMocap } from './mocap/store'
import { SCALE_IDS, SCALE_PRESETS, type ScaleId } from './scene/worldRoot'

/**
 * By default no rays in XR: objects are grabbed directly. Hands keep the grab pointer (pinch/fist on contact)
 * and the touch pointer (poke buttons and the ground); controllers keep the grab pointer (grip on contact).
 * Rays can be switched on at any time (HUD, X key, wrist menu); see editor/xrInput.ts.
 * Every pointer still emits the same pointer events, so the editor doesn't care which is used.
 */
export const xrStore = createXRStore({
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
]

const STATUS_TEXT = {
  idle: 'No goal set',
  moving: 'Robot moving',
  arrived: 'Arrived',
  'no-path': 'No route to goal',
} as const

export default function App() {
  useKeyboard()
  return (
    <>
      <Canvas shadows="percentage" camera={{ position: [0, 2.0, 0.2], fov: 50 }}>
        <XR store={xrStore}>
          <Scene />
        </XR>
      </Canvas>
      <Hud />
      <Inspector />
    </>
  )
}

function Hud() {
  const tool = useWorld((s) => s.tool)
  const setTool = useWorld((s) => s.setTool)
  const selectedId = useWorld((s) => s.selectedId)
  const status = useNav((s) => s.status)
  const replans = useNav((s) => s.replanCount)
  const snap = useEditor((s) => s.snap)
  const worldScale = useEditor((s) => s.worldScale)
  const rays = useEditor((s) => s.rays)
  const mocap = useMocap()
  return (
    <div className="hud">
      <div className="row">
        <strong>RealmForge XR</strong>
        <button onClick={() => xrStore.enterAR()}>Enter AR</button>
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
        <button className={rays ? 'on' : ''} onClick={toggleRays} title="XR pointer rays on hands and controllers">
          X Rays
        </button>
        <button className={mocap.enabled ? 'on' : ''} onClick={toggleMocap} title="Smartsuit Pro live skeleton (needs npm run mocap:bridge or mocap:mock)">
          Mocap
        </button>
        <button onClick={() => useWorld.getState().reset()}>Reset</button>
      </div>
      <div className="row">
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
      <div className="status">
        {STATUS_TEXT[status]} · replans {replans}
        {mocap.enabled && ` · mocap ${mocap.status}${mocap.status === 'live' ? ` ${mocap.fps} fps` : ''}`}
      </div>
      {mocap.enabled && mocap.status === 'error' && <div className="status">{mocap.error}</div>}
      <div className="help">
        Drag empty ground to orbit. Select: drag an object to move it, yellow handle resizes, blue handle rotates,
        green cube duplicates, purple cube changes style, red cube deletes.
        Keys: R rotate 15°, [ ] height, D duplicate, M material/style, T roof, G snap, X rays, Del delete.
      </div>
    </div>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing into the inspector's fields must not trigger shortcuts.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      const w = useWorld.getState()
      const tool = TOOLS.find((t) => t.key === e.key)
      if (tool) return w.setTool(tool.id)
      if (e.key === 'b' || e.key === 'B') return blockRoute()
      if (e.key === 'g' || e.key === 'G') return useEditor.getState().set({ snap: !useEditor.getState().snap })
      if (e.key === 'x' || e.key === 'X') return toggleRays()
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
