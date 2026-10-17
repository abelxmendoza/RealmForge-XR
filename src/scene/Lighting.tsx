import { useMemo } from 'react'
import * as THREE from 'three'
import { WORLD_ROOT } from './worldRoot'
import { useEnvironment } from '../world/environment'

/**
 * Lighting for the tabletop miniature. Colors/intensities follow the active environment
 * (Forge / Mars / Warehouse); shadow camera stays fitted to the board.
 */
export function Lighting() {
  const lighting = useEnvironment((s) => s.appearance.lighting)
  const target = useMemo(() => {
    const t = new THREE.Object3D()
    t.position.copy(WORLD_ROOT.position)
    return t
  }, [])
  const sun = WORLD_ROOT.position.clone().add(new THREE.Vector3(1.2, 2.2, 0.9))
  return (
    <>
      <hemisphereLight args={[lighting.hemiSky, lighting.hemiGround, lighting.hemiIntensity]} />
      <primitive object={target} />
      <directionalLight
        position={sun}
        target={target}
        intensity={lighting.sunIntensity}
        color={lighting.sunColor}
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
      <directionalLight
        position={WORLD_ROOT.position.clone().add(new THREE.Vector3(-1.5, 1.2, -2))}
        intensity={lighting.rimIntensity}
        color={lighting.rimColor}
      />
    </>
  )
}
