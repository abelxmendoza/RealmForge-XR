import { useMemo } from 'react'
import * as THREE from 'three'
import { WORLD_ROOT } from './worldRoot'

/**
 * Lighting for the tabletop miniature: sky/ground fill plus one shadow-casting sun whose
 * shadow camera is fitted tightly to the board (about 1.5 m across), so a 1024 map stays sharp.
 */
export function Lighting() {
  const target = useMemo(() => {
    const t = new THREE.Object3D()
    t.position.copy(WORLD_ROOT.position)
    return t
  }, [])
  const sun = WORLD_ROOT.position.clone().add(new THREE.Vector3(1.2, 2.2, 0.9))
  return (
    <>
      <hemisphereLight args={['#e3eeff', '#5a4d3c', 1.1]} />
      <primitive object={target} />
      <directionalLight
        position={sun}
        target={target}
        intensity={2.2}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.004}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.5}
        shadow-camera-far={5}
      />
      {/* Cool rim light from the back so building silhouettes separate from the board. */}
      <directionalLight position={WORLD_ROOT.position.clone().add(new THREE.Vector3(-1.5, 1.2, -2))} intensity={0.5} color="#9cc8ff" />
    </>
  )
}
