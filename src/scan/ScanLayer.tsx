import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { worldRootRef } from '../scene/worldRoot'
import { loadScanModel } from './importScan'
import { addMeasurePoint, scanPosition, setScanStatus, useScan } from './store'

/** Sits a hair under the world floor so the ground grid doesn't flicker against the scanned floor. */
const FLOOR_GAP = 0.01
const noRaycast = () => {}
/** Keeps what lies below the cut height (in world-root space; moved into scene space every frame). */
const cutLocal = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)
const cutWorld = new THREE.Plane()
const local = new THREE.Vector3()

/** Raycast that ignores the parts of the scan cut away above `cut` (so measuring clicks reach the floor, not a hidden ceiling). */
function clippedRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  const from = hits.length
  THREE.Mesh.prototype.raycast.call(this, raycaster, hits)
  const cut = useScan.getState().scan?.cutHeight
  const root = worldRootRef.current
  if (cut == null || !root) return
  for (let i = hits.length - 1; i >= from; i--) {
    if (root.worldToLocal(local.copy(hits[i].point)).y > cut) hits.splice(i, 1)
  }
}

/**
 * The imported scan, drawn inside the world root so it lines up with props on desktop and in XR.
 * It never takes clicks (props and the ground behind it stay usable) except while measuring.
 */
export function ScanLayer() {
  const scan = useScan((s) => s.scan)
  const measuring = useScan((s) => s.measuring)
  const points = useScan((s) => s.measurePoints)
  const [model, setModel] = useState<THREE.Object3D | null>(null)
  const id = scan?.id
  const modelVersion = useScan((s) => s.modelVersion)
  const cut = scan?.cutHeight ?? null
  const cutOn = cut !== null
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    gl.localClippingEnabled = true
  }, [gl])

  // Follow the world root (moved, scaled or pinned in XR) so the cut stays at the same height over the floor.
  useFrame(() => {
    if (cut === null || !worldRootRef.current) return
    cutLocal.constant = cut
    cutWorld.copy(cutLocal).applyMatrix4(worldRootRef.current.matrixWorld)
  })

  useEffect(() => {
    setModel(null)
    if (!id) return
    let cancelled = false
    setScanStatus('loading', 'Loading scan…')
    loadScanModel(id)
      .then((m) => {
        if (cancelled) return
        if (!m) {
          setScanStatus('missing', 'This world’s scan file isn’t on this device. Import it again to restore it.')
          return
        }
        setModel(m)
        setScanStatus('ready')
      })
      .catch((e: unknown) => !cancelled && setScanStatus('error', e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // modelVersion: a re-linked file arrives under the same id.
  }, [id, modelVersion])

  // See-through materials and click-through meshes (except while measuring). The cut height itself only
  // moves the plane in useFrame; switching the cut on or off is what needs the materials rebuilt.
  const opacity = scan?.opacity ?? 1
  useEffect(() => {
    if (!model) return
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.raycast = measuring ? clippedRaycast : noRaycast
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        m.clippingPlanes = cutOn ? [cutWorld] : null
        m.transparent = opacity < 0.99
        m.opacity = opacity
        m.depthWrite = opacity >= 0.99
        m.needsUpdate = true
      }
    })
  }, [model, opacity, measuring, cutOn])

  if (!scan || !model) return null
  const [x, y, z] = scanPosition(scan)

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!measuring || !worldRootRef.current) return
    e.stopPropagation()
    const p = worldRootRef.current.worldToLocal(e.point.clone())
    addMeasurePoint([p.x, p.y, p.z])
  }
  const stop = (e: ThreeEvent<PointerEvent>) => measuring && e.stopPropagation()

  return (
    <group>
      <group
        visible={scan.visible}
        position={[x, y - FLOOR_GAP, z]}
        rotation={[0, scan.rotationY, 0]}
        scale={scan.scale}
        onClick={pick}
        onPointerDown={stop}
      >
        <primitive object={model} />
      </group>
      {points.map((p, i) => (
        <mesh key={i} position={p} renderOrder={20}>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshBasicMaterial color="#f0a46a" depthTest={false} />
        </mesh>
      ))}
      {points.length === 2 && <Line points={points} color="#f0a46a" lineWidth={3} depthTest={false} renderOrder={20} />}
    </group>
  )
}
