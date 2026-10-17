import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { WORLD } from '../world/types'
import { useEnvironment } from '../world/environment'
import { worldRootRef } from './worldRoot'

const SUN_DIR = new THREE.Vector3(1.2, 2.2, 0.9)
const RIM_DIR = new THREE.Vector3(-1.5, 1.2, -2)
const SHADOW_MAP = 1024

/**
 * Environment-tinted lighting that follows the world root at any presentation scale.
 * Shadow camera fits the board's real size (tabletop → life size).
 */
export function Lighting() {
  const lighting = useEnvironment((s) => s.appearance.lighting)
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
      sun.current.shadow.normalBias = ((2 * extent) / SHADOW_MAP) * 1.5
      fitted.current = extent
    }
  })

  return (
    <>
      <hemisphereLight args={[lighting.hemiSky, lighting.hemiGround, lighting.hemiIntensity]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        target={target}
        intensity={lighting.sunIntensity}
        color={lighting.sunColor}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-bias={-0.0004}
      />
      <directionalLight ref={rim} target={target} intensity={lighting.rimIntensity} color={lighting.rimColor} />
    </>
  )
}
