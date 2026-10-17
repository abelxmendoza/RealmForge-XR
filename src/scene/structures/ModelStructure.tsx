import { Component, Suspense, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { WorldObject } from '../../world/types'
import type { CatalogAsset } from '../../world/assetLibrary'

/**
 * A custom library asset drawn from its .glb model (see docs/asset-library.md), fitted to the object's
 * real size: `stretch` scales each axis to the footprint and height, `contain` keeps proportions inside
 * it. The model's base sits on the ground at the object's origin. While loading, or if the file is
 * missing or broken, a translucent placeholder box of the same size stands in, so the world still works.
 */
export function ModelStructure({ o, asset }: { o: WorldObject; asset: CatalogAsset }) {
  const placeholder = <Placeholder size={o.size} color={asset.color} />
  if (!asset.render) return placeholder
  return (
    <ModelErrorBoundary fallback={placeholder} url={asset.render.model}>
      <Suspense fallback={placeholder}>
        <FittedModel url={asset.render.model} size={o.size} fit={asset.render.fit} />
      </Suspense>
    </ModelErrorBoundary>
  )
}

function FittedModel({ url, size, fit }: { url: string; size: WorldObject['size']; fit: 'contain' | 'stretch' }) {
  const { scene } = useGLTF(url)
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(root)
    const dims = box.getSize(new THREE.Vector3())
    const sx = size[0] / Math.max(dims.x, 1e-6)
    const sy = size[1] / Math.max(dims.y, 1e-6)
    const sz = size[2] / Math.max(dims.z, 1e-6)
    const k = Math.min(sx, sy, sz)
    const scale = fit === 'stretch' ? new THREE.Vector3(sx, sy, sz) : new THREE.Vector3(k, k, k)
    const center = box.getCenter(new THREE.Vector3())
    // Centre the footprint on the origin and put the model's base on the ground.
    const offset = new THREE.Vector3(-center.x * scale.x, -box.min.y * scale.y, -center.z * scale.z)
    return { root, scale, offset }
  }, [scene, size, fit])
  return (
    <group position={model.offset} scale={model.scale}>
      <primitive object={model.root} />
    </group>
  )
}

function Placeholder({ size, color }: { size: WorldObject['size']; color: string }) {
  return (
    <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={0.6} roughness={0.8} />
    </mesh>
  )
}

class ModelErrorBoundary extends Component<{ fallback: ReactNode; url: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn(`[RealmForge] model ${this.props.url} could not load; showing a placeholder`, error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
