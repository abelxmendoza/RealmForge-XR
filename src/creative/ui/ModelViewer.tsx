import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { WebGLGuard } from './WebGLGuard'
import { frameModel, parseGlb, setWireframe, LIGHTING_PRESETS, type Framing, type LightingPreset } from '../viewer/model'

/**
 * GLB / glTF viewer: orbit (drag), zoom (wheel), pan (right-drag / shift-drag), reset, wireframe, grid,
 * lighting presets, background, bounding box with dimensions, screenshot. Models are shown at their
 * real size in metres (grid cells are 1 m when the model is larger than 2 m, else 10 cm).
 */
export function ModelViewer({ url, title, onScreenshot }: { url: string | null; title: string; onScreenshot?: (png: Blob) => void }) {
  const [model, setModel] = useState<THREE.Group | null>(null)
  const [framing, setFraming] = useState<Framing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [wireframe, setWire] = useState(false)
  const [grid, setGrid] = useState(true)
  const [bbox, setBbox] = useState(false)
  const [lighting, setLighting] = useState<LightingPreset>('studio')
  const [background, setBackground] = useState('#1b1714')
  const [resetTick, setResetTick] = useState(0)
  const glRef = useRef<THREE.WebGLRenderer | null>(null)

  useEffect(() => {
    if (!url) { setModel(null); setFraming(null); setError(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer() })
      .then(parseGlb)
      .then((scene) => {
        if (cancelled) return
        setFraming(frameModel(scene))
        setModel(scene)
        setResetTick((t) => t + 1)
      })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setModel(null); setFraming(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  useEffect(() => { if (model) setWireframe(model, wireframe) }, [model, wireframe])

  const screenshot = () => {
    const canvas = glRef.current?.domElement
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${title.replace(/[^a-z0-9-]+/gi, '_') || 'model'}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      onScreenshot?.(blob)
    }, 'image/png')
  }

  const dims = framing ? framing.size.toArray().map((v) => v.toFixed(3)).join(' × ') : null

  return (
    <div className="cs-viewer" data-testid="model-viewer" data-state={error ? 'error' : loading ? 'loading' : model ? 'ready' : 'empty'}>
      <div className="cs-viewer-toolbar" role="toolbar" aria-label="Viewer controls">
        <button type="button" onClick={() => setResetTick((t) => t + 1)} disabled={!model}>Reset view</button>
        <label><input type="checkbox" checked={wireframe} onChange={(e) => setWire(e.target.checked)} /> Wireframe</label>
        <label><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid</label>
        <label><input type="checkbox" checked={bbox} onChange={(e) => setBbox(e.target.checked)} /> Bounds</label>
        <label>Light <select value={lighting} onChange={(e) => setLighting(e.target.value as LightingPreset)}>
          {Object.entries(LIGHTING_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select></label>
        <label>Background <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></label>
        <button type="button" onClick={screenshot} disabled={!model}>Screenshot</button>
      </div>
      <div className="cs-viewer-stage">
        <WebGLGuard what="The 3D viewer">
        <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 45, near: 0.01, far: 1000, position: [2, 1.5, 3] }} shadows>
          <color attach="background" args={[background]} />
          <GlGrab target={glRef} />
          <Lights preset={lighting} scale={framing?.radius ?? 1} />
          {model && <primitive object={model} />}
          {model && framing && grid && <FloorGrid framing={framing} />}
          {model && framing && bbox && <BoundsBox framing={framing} />}
          <Controls framing={framing} resetTick={resetTick} />
        </Canvas>
        </WebGLGuard>
        {loading && <p className="cs-overlay" role="status">Loading model…</p>}
        {error && <p className="cs-overlay cs-error" role="alert">Model could not load: {error}</p>}
        {!url && <p className="cs-overlay">No model yet. Generate one, or import a GLB you have the rights to.</p>}
      </div>
      {framing && (
        <p className="cs-viewer-info" data-testid="viewer-info">
          {dims} m · {framing.triangles.toLocaleString()} triangles · drag to orbit, wheel to zoom, right-drag to pan
        </p>
      )}
    </div>
  )
}

function GlGrab({ target }: { target: React.MutableRefObject<THREE.WebGLRenderer | null> }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => { target.current = gl }, [gl, target])
  return null
}

function Lights({ preset, scale }: { preset: LightingPreset; scale: number }) {
  const p = LIGHTING_PRESETS[preset]
  const s = Math.max(scale, 0.5)
  return (
    <>
      <ambientLight intensity={p.ambient} />
      {p.hemi > 0 && <hemisphereLight args={['#fff4e6', '#2a2018', p.hemi]} />}
      {p.key[3] > 0 && <directionalLight position={[p.key[0] * s, p.key[1] * s, p.key[2] * s]} intensity={p.key[3]} castShadow />}
      {p.fill[3] > 0 && <directionalLight position={[p.fill[0] * s, p.fill[1] * s, p.fill[2] * s]} intensity={p.fill[3]} />}
    </>
  )
}

function FloorGrid({ framing }: { framing: Framing }) {
  const big = Math.max(framing.size.x, framing.size.z) > 2
  const cell = big ? 1 : 0.1
  const span = Math.ceil((Math.max(framing.size.x, framing.size.z) * 2) / cell) * cell + cell * 4
  const helper = useMemo(() => new THREE.GridHelper(span, Math.round(span / cell), 0xe07845, 0x5a4a3e), [span, cell])
  return <primitive object={helper} position={[framing.center.x, framing.box.min.y, framing.center.z]} />
}

function BoundsBox({ framing }: { framing: Framing }) {
  const helper = useMemo(() => new THREE.Box3Helper(framing.box.clone(), new THREE.Color('#f0a46a')), [framing])
  return <primitive object={helper} />
}

function Controls({ framing, resetTick }: { framing: Framing | null; resetTick: number }) {
  const ref = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useEffect(() => {
    if (!framing || !ref.current) return
    camera.position.copy(framing.camera)
    camera.near = Math.max(framing.radius / 100, 0.001)
    camera.far = framing.radius * 100
    camera.updateProjectionMatrix()
    ref.current.target.copy(framing.center)
    ref.current.update()
  }, [framing, resetTick, camera])
  return <OrbitControls ref={ref} makeDefault enableDamping screenSpacePanning />
}
