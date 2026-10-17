import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { Scene } from './scene/Scene'
import { useWorld, type Tool } from './world/store'
import { useNav } from './nav/navigation'
import { blockRoute } from './editor/demo'

/** Hands and controllers both emit the same pointer events, so the editor doesn't care which is used. */
export const xrStore = createXRStore()

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'select', label: 'Select / move', key: '1' },
  { id: 'wall', label: 'Draw wall', key: '2' },
  { id: 'building', label: 'Building', key: '3' },
  { id: 'goal', label: 'Set goal', key: '4' },
  { id: 'robot', label: 'Place robot', key: '5' },
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
    </>
  )
}

function Hud() {
  const tool = useWorld((s) => s.tool)
  const setTool = useWorld((s) => s.setTool)
  const selectedId = useWorld((s) => s.selectedId)
  const status = useNav((s) => s.status)
  const replans = useNav((s) => s.replanCount)
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
        <button disabled={!selectedId} onClick={() => selectedId && useWorld.getState().removeObject(selectedId)}>
          Del Delete
        </button>
        <button onClick={() => useWorld.getState().reset()}>Reset</button>
      </div>
      <div className="status">
        {STATUS_TEXT[status]} · replans {replans}
      </div>
      <div className="help">
        Drag empty ground to orbit. Select: drag an object to move it, yellow handle resizes, blue handle rotates.
        Keys: R rotate 15°, [ ] height, Del delete.
      </div>
    </div>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const w = useWorld.getState()
      const tool = TOOLS.find((t) => t.key === e.key)
      if (tool) return w.setTool(tool.id)
      if (e.key === 'b' || e.key === 'B') return blockRoute()
      const sel = w.selectedId ? w.objects[w.selectedId] : null
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') w.removeObject(sel.id)
      else if (e.key === 'r' || e.key === 'R') w.updateObject(sel.id, { rotationY: sel.rotationY + (e.shiftKey ? -1 : 1) * (Math.PI / 12) })
      else if (e.key === ']') w.updateObject(sel.id, { size: [sel.size[0], sel.size[1] + 0.25, sel.size[2]] })
      else if (e.key === '[') w.updateObject(sel.id, { size: [sel.size[0], Math.max(0.3, sel.size[1] - 0.25), sel.size[2]] })
      else if (e.key === 'Escape') w.select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
