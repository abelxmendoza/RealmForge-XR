/**
 * Viewer model helpers: parse a GLB, measure it, frame the camera, toggle wireframe. Kept free of React
 * so tests can load real GLB bytes through the same GLTFLoader the viewer uses.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'

export function parseGlb(data: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, '', (gltf) => resolve(gltf.scene), (e) => reject(e instanceof Error ? e : new Error(String(e))))
  })
}

export interface Framing {
  box: THREE.Box3
  size: THREE.Vector3
  center: THREE.Vector3
  radius: number
  /** Camera position that shows the whole model at the given vertical FOV (degrees). */
  camera: THREE.Vector3
  triangles: number
}

export function frameModel(root: THREE.Object3D, fovDeg = 45): Framing {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) throw new Error('model has no geometry')
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.length() / 2, 1e-3)
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(fovDeg) / 2)
  const camera = center.clone().add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(dist * 1.05))
  let triangles = 0
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    if ((o as THREE.Mesh).isMesh && g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return { box, size, center, radius, camera, triangles: Math.round(triangles) }
}

export function setWireframe(root: THREE.Object3D, on: boolean) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
    if (!m) return
    for (const mat of Array.isArray(m) ? m : [m]) if ('wireframe' in mat) (mat as THREE.MeshStandardMaterial).wireframe = on
  })
}

export const LIGHTING_PRESETS = {
  studio: { label: 'Studio', ambient: 0.35, hemi: 0.5, key: [3, 5, 4, 2.2], fill: [-4, 2, -2, 0.7] },
  soft: { label: 'Soft', ambient: 0.7, hemi: 0.8, key: [2, 6, 3, 0.9], fill: [-3, 3, -3, 0.5] },
  dramatic: { label: 'Dramatic', ambient: 0.08, hemi: 0.1, key: [5, 3, 1, 3.5], fill: [-2, 1, -4, 0.2] },
  flat: { label: 'Flat', ambient: 1.6, hemi: 0, key: [0, 5, 0, 0], fill: [0, 0, 0, 0] },
} as const
export type LightingPreset = keyof typeof LIGHTING_PRESETS
