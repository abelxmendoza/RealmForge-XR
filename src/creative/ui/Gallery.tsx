import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Html } from '@react-three/drei'
import type { AssetManifest } from '../manifest'
import { api } from './api'
import { WebGLGuard } from './WebGLGuard'

export interface GalleryItem {
  id: string
  name: string
  url: string
  extents: [number, number, number]
  licence: { id: string; attribution?: string; source?: string; revision?: string; changes?: string }
  origin: 'sample' | 'library'
}

const base = import.meta.env.BASE_URL ?? '/'

interface GalleryDoc {
  assets: { id: string; name: string; file: string; extents_m: [number, number, number]; licence: GalleryItem['licence'] }[]
}

export function useGalleryItems(library: AssetManifest[]): { items: GalleryItem[]; error: string | null } {
  const [samples, setSamples] = useState<GalleryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(`${base}creative/gallery/gallery.json`)
      .then((r) => { if (!r.ok) throw new Error(`gallery.json HTTP ${r.status}`); return r.json() as Promise<GalleryDoc> })
      .then((doc) => setSamples(doc.assets.map((a) => ({ id: a.id, name: a.name, url: `${base}creative/gallery/${a.file}`, extents: a.extents_m, licence: a.licence, origin: 'sample' as const }))))
      .catch((e: Error) => setError(e.message))
  }, [])
  const own = library.filter((m) => m.converted).map((m): GalleryItem => ({
    id: m.id, name: m.title, url: api.fileUrl(m.id, m.converted!.file), extents: m.converted!.extents,
    licence: { id: m.licence.origin, attribution: m.licence.attribution }, origin: 'library',
  }))
  return { items: [...samples, ...own], error }
}

/** Small interactive gallery: each model on a plinth along an arc; click to inspect, open in viewer. */
export function Gallery({ library, onOpen }: { library: AssetManifest[]; onOpen: (item: GalleryItem) => void }) {
  const { items, error } = useGalleryItems(library)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const sel = items.find((i) => i.id === selected) ?? null
  const layout = useMemo(() => {
    const n = items.length
    const r = Math.max(3, n * 0.9)
    return items.map((it, i) => {
      const a = n === 1 ? 0 : (-0.6 + (1.2 * i) / (n - 1)) * Math.PI / 2
      return { it, pos: [Math.sin(a) * r, 0, -Math.cos(a) * r + r] as [number, number, number], rotY: -a }
    })
  }, [items])

  return (
    <div className="cs-gallery" data-testid="gallery">
      <div className="cs-gallery-stage">
        <WebGLGuard what="The gallery">
        <Canvas shadows camera={{ position: [0, 3.2, 8.5], fov: 50 }}>
          <color attach="background" args={['#15110e']} />
          <fog attach="fog" args={['#15110e', 8, 22]} />
          <hemisphereLight args={['#fff1e0', '#1a120c', 0.6]} />
          <directionalLight position={[4, 8, 5]} intensity={1.8} castShadow shadow-mapSize={[1024, 1024]} />
          <mesh rotation-x={-Math.PI / 2} receiveShadow>
            <circleGeometry args={[14, 64]} />
            <meshStandardMaterial color="#2a211b" roughness={0.95} />
          </mesh>
          {layout.map(({ it, pos, rotY }) => (
            <group key={it.id} position={pos} rotation-y={rotY}
              onClick={(e) => { e.stopPropagation(); setSelected(it.id) }}
              onPointerOver={(e) => { e.stopPropagation(); setHover(it.id) }} onPointerOut={() => setHover(null)}>
              <mesh position={[0, 0.1, 0]} receiveShadow castShadow>
                <cylinderGeometry args={[Math.max(it.extents[0], it.extents[2]) * 0.62 + 0.1, Math.max(it.extents[0], it.extents[2]) * 0.66 + 0.1, 0.2, 48]} />
                <meshStandardMaterial color={selected === it.id ? '#e07845' : hover === it.id ? '#6a5040' : '#3d3029'} roughness={0.6} />
              </mesh>
              <group position={[0, 0.2, 0]}>
                <ModelBoundary fallback={<PlaceholderBox size={it.extents} />}>
                  <Suspense fallback={<PlaceholderBox size={it.extents} />}>
                    <GalleryModel url={it.url} />
                  </Suspense>
                </ModelBoundary>
              </group>
              <Html position={[0, -0.05, Math.max(it.extents[2], 0.5) * 0.8 + 0.2]} center distanceFactor={7} className="cs-plaque">{it.name}</Html>
            </group>
          ))}
          <OrbitControls makeDefault target={[0, 0.6, 1.5]} maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={16} />
        </Canvas>
        </WebGLGuard>
        {error && <p className="cs-overlay cs-error" role="alert">Gallery samples unavailable: {error}</p>}
      </div>
      <aside className="cs-gallery-info" aria-live="polite">
        {sel ? (
          <>
            <h3>{sel.name}</h3>
            <p>{sel.extents.map((v) => v.toFixed(2)).join(' × ')} m</p>
            {sel.origin === 'sample'
              ? <p className="cs-attrib">{sel.licence.id} · <strong>{sel.licence.attribution}</strong><br /><a href={sel.licence.source} target="_blank" rel="noreferrer">{sel.licence.source}</a> @ {sel.licence.revision?.slice(0, 8)}<br /><small>{sel.licence.changes}</small></p>
              : <p className="cs-attrib">From your library ({sel.licence.id})</p>}
            <button type="button" className="cs-primary" onClick={() => onOpen(sel)}>Open in viewer</button>
          </>
        ) : <p>Click a model to inspect it. Drag to look around.</p>}
        <p className="cs-attrib-foot">Sample models: “projectsim by Kaedim”, CC-BY-4.0.</p>
      </aside>
    </div>
  )
}

function GalleryModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true } })
    // Base on the plinth, footprint centred (library models may not be pre-centred).
    const box = new THREE.Box3().setFromObject(root)
    const c = box.getCenter(new THREE.Vector3())
    root.position.set(-c.x, -box.min.y, -c.z)
    const g = new THREE.Group()
    g.add(root)
    return g
  }, [scene])
  return <primitive object={obj} />
}

function PlaceholderBox({ size }: { size: [number, number, number] }) {
  return (
    <mesh position={[0, size[1] / 2, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#9aa4ad" transparent opacity={0.4} />
    </mesh>
  )
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn('[creative] gallery model failed; showing placeholder', e) }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
