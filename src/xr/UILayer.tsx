import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Menus and pointer rays always draw on top: occlusion (real walls, furniture, your room's depth) and
 * virtual objects never hide them, so you can always reach the toggle that turns occlusion off.
 *
 * How: everything inside goes last in the transparent pass (render order UI_ORDER and up). Just before it,
 * a tiny marker object clears the depth buffer, so the UI only depth-tests against itself.
 * three renders each eye's whole list in turn, so one clear per eye is enough.
 */
export const UI_ORDER = 10_000

/** Ray and cursor options for XR pointers, so rays share the on-top layer (see editor/xrInput.ts). */
export const UI_RAY_POINTER = {
  rayModel: { renderOrder: UI_ORDER + 500 },
  cursorModel: { renderOrder: UI_ORDER + 501 },
} as const

export function liftToUI(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh && !(obj as THREE.Sprite).isSprite) return
    // Keep each object's own order (text over its tile) on top of the UI base.
    if (mesh.userData.uiBaseOrder === undefined) mesh.userData.uiBaseOrder = mesh.renderOrder
    mesh.renderOrder = UI_ORDER + 1 + Math.max(0, Math.min(400, mesh.userData.uiBaseOrder))
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of materials) if (m && !m.transparent) m.transparent = true
  })
}

/** Wrap XR menus (wrist, palette, guide) in this. */
export function UILayer({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null)
  const marker = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1e-4, 1e-4),
      new THREE.MeshBasicMaterial({ transparent: true, colorWrite: false, depthWrite: false, depthTest: false }),
    )
    m.frustumCulled = false
    m.renderOrder = UI_ORDER
    m.raycast = () => {}
    m.onBeforeRender = (renderer) => renderer.clearDepth()
    return m
  }, [])
  // Menus add and remove buttons as pages change, so re-apply each frame (a few hundred objects at most).
  useFrame(() => {
    if (group.current) liftToUI(group.current)
  })
  return (
    <>
      <primitive object={marker} />
      <group ref={group}>{children}</group>
    </>
  )
}
