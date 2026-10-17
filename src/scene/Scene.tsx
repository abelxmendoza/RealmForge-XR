import { useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useWorld } from '../world/store'
import { Ground } from '../editor/Ground'
import { Obstacles } from '../editor/Obstacles'
import { dragMove, endDrag } from '../editor/drag'
import { tickDemo } from '../editor/demo'
import { Robot } from '../agent/Robot'
import { Route } from './Route'
import { Lighting } from './Lighting'
import { WORLD_ROOT, worldRootRef } from './worldRoot'

export function Scene() {
  const dragging = useWorld((s) => s.dragging)
  const inXR = useXR((s) => s.session != null)
  const mode = useXR((s) => s.mode)

  // Mouse releases outside the canvas still end a drag.
  useEffect(() => {
    const up = (e: PointerEvent) => endDrag(e.pointerId)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  useFrame(tickDemo)

  const onUp = (e: ThreeEvent<PointerEvent>) => endDrag(e.pointerId)

  return (
    <>
      {mode !== 'immersive-ar' && <color attach="background" args={['#1d2433']} />}
      <Lighting />
      {!inXR && <OrbitControls makeDefault enabled={!dragging} target={WORLD_ROOT.position} />}

      <group
        ref={(g) => {
          worldRootRef.current = g
        }}
        position={WORLD_ROOT.position}
        scale={WORLD_ROOT.scale}
        onPointerMove={dragMove}
        onPointerUp={onUp}
      >
        <DragCatcher />
        <Ground />
        <Obstacles />
        <Route />
        <Robot />
      </group>
    </>
  )
}

/** Big invisible plane under the map so drags keep receiving moves past the map edge. */
function DragCatcher() {
  const dragging = useWorld((s) => s.dragging)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} raycast={dragging ? THREE.Mesh.prototype.raycast : () => null}>
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
