import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { worldRootRef } from '../scene/worldRoot'
import { disposeScanModel, loadScanModel } from './importScan'
import { addMeasurePoint, scanPosition, setScanStatus, useScan, type ScanSettings } from './store'

const noRaycast = () => {}

/** Each visible section owns its geometry/materials and clipping plane on both desktop and XR. */
function Section({ scan }: { scan: ScanSettings }) {
  const measuring = useScan((s) => s.measuring && s.activeId === scan.id)
  const revision = useScan((s) => s.runtime[scan.id]?.modelVersion)
  const [model, setModel] = useState<THREE.Object3D | null>(null)
  const gl = useThree((s) => s.gl)
  const planes = useMemo(() => ({ local: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), world: new THREE.Plane(), point: new THREE.Vector3() }), [])
  const cutOn = scan.cutHeight !== null

  useEffect(() => { gl.localClippingEnabled = true }, [gl])
  useFrame(() => {
    if (scan.cutHeight === null || !worldRootRef.current) return
    // Cut relative to THIS section's elevation; upstairs and yard sections stay independent.
    planes.local.constant = scan.offset[1] + scan.cutHeight
    planes.world.copy(planes.local).applyMatrix4(worldRootRef.current.matrixWorld)
  })
  useEffect(() => {
    let cancelled = false
    let owned: THREE.Object3D | null = null
    setModel(null)
    setScanStatus('loading', 'Loading section…', scan.id)
    loadScanModel(scan.id).then((root) => {
      if (cancelled) { if (root) disposeScanModel(root); return }
      if (!root) { setScanStatus('missing', 'This section’s file is missing on this device. Re-link it or open the property bundle.', scan.id); return }
      owned = root
      setModel(root)
      setScanStatus('ready', null, scan.id)
    }).catch((e: unknown) => { if (!cancelled) setScanStatus('error', e instanceof Error ? e.message : String(e), scan.id) })
    return () => { cancelled = true; if (owned) disposeScanModel(owned) }
  }, [scan.id, revision])

  useEffect(() => {
    if (!model) return
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.raycast = measuring ? function(this: THREE.Mesh, raycaster, hits) {
        const from = hits.length
        THREE.Mesh.prototype.raycast.call(this, raycaster, hits)
        const root = worldRootRef.current
        if (scan.cutHeight === null || !root) return
        for (let i = hits.length - 1; i >= from; i--) {
          if (root.worldToLocal(planes.point.copy(hits[i].point)).y > scan.offset[1] + scan.cutHeight) hits.splice(i, 1)
        }
      } : noRaycast
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.clippingPlanes = cutOn ? [planes.world] : null
        m.transparent = scan.opacity < 0.99
        m.opacity = scan.opacity
        m.depthWrite = scan.opacity >= 0.99
        m.needsUpdate = true
      }
    })
  }, [model, measuring, scan.opacity, scan.cutHeight, scan.offset[1], cutOn, planes])

  if (!model) return null
  const [x, y, z] = scanPosition(scan)
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!measuring || !worldRootRef.current) return
    e.stopPropagation()
    const p = worldRootRef.current.worldToLocal(e.point.clone())
    addMeasurePoint([p.x, p.y, p.z])
  }
  return <group position={[x, y - 0.01, z]} rotation={[0, scan.rotationY, 0]} scale={scan.scale}
    onClick={pick} onPointerDown={(e) => { if (measuring) e.stopPropagation() }}>
    <primitive object={model} dispose={null} />
  </group>
}

export function ScanLayer() {
  const scans = useScan((s) => s.scans)
  const points = useScan((s) => s.measurePoints)
  return <group>
    {scans.filter((s) => s.visible).map((scan) => <Section key={scan.id} scan={scan} />)}
    {points.map((p, i) => <mesh key={i} position={p} renderOrder={20} raycast={noRaycast}>
      <sphereGeometry args={[0.08, 12, 8]} /><meshBasicMaterial color="#f0a46a" depthTest={false} />
    </mesh>)}
    {points.length === 2 && <Line points={points} color="#f0a46a" lineWidth={3} depthTest={false} renderOrder={20} raycast={noRaycast} />}
  </group>
}
