import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { WORLD } from '../world/types'
import { worldRootRef } from './worldRoot'

const SUN_DIR = new THREE.Vector3(1.2, 2.2, 0.9)
const RIM_DIR = new THREE.Vector3(-1.5, 1.2, -2)

/**
 * Lighting for the world at any scale: sky/ground fill plus one shadow-casting sun whose
 * shadow camera is fitted to the board (its real size, from tabletop to life size), so a
 * 1024 map stays as sharp as it can. Follows the world root every frame, so moving the map
 * (grab or scale preset) keeps shadows on it.
 */
export function Lighting() {
  const target = useMemo(() => new THREE.Object3D(), [])
  const sun = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const fitted = useRef(0)
  const center = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const root = worldRootRef.current
    if (!root || !sun.current || !rim.current) return
    root.getWorldPosition(center)
    root.getWorldScale(scale)
    // Half the board's real size, with a margin for tall buildings' shadows.
    const extent = WORLD.half * scale.x * 1.3
    target.position.copy(center)
    sun.current.position.copy(center).addScaledVector(SUN_DIR, extent)
    rim.current.position.copy(center).addScaledVector(RIM_DIR, extent)
    if (Math.abs(fitted.current - extent) > 1e-6) {
      const cam = sun.current.shadow.camera
      cam.left = -extent
      cam.right = extent
      cam.top = extent
      cam.bottom = -extent
      cam.near = extent * 0.25
      cam.far = extent * 6
      cam.updateProjectionMatrix()
      fitted.current = extent
    }
  })

  return (
    <>
      <hemisphereLight args={['#e3eeff', '#5a4d3c', 1.1]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        intensity={2.2}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.004}
      />
      {/* Cool rim light from the back so building silhouettes separate from the board. */}
      <directionalLight ref={rim} target={target} intensity={0.5} color="#9cc8ff" />
    </>
  )
}
