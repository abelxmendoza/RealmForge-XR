import { useEffect } from 'react'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import { useXR } from '@react-three/xr'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEditor } from '../editor/settings'
import { useWorld } from '../world/store'
import { Ground } from '../editor/Ground'
import { Obstacles } from '../editor/Obstacles'
import { dragMove, endDrag } from '../editor/drag'
import { tickDemo } from '../editor/demo'
import { Robot } from '../agent/Robot'
import { Route } from './Route'
import { Lighting } from './Lighting'
import { WristMenu } from '../editor/WristMenu'
import { SCALE_PRESETS, WORLD_ROOT, placement, worldPlacement, worldRootRef } from './worldRoot'

export function Scene() {
  const dragging = useWorld((s) => s.dragging)
  const inXR = useXR((s) => s.session != null)
  const mode = useXR((s) => s.mode)
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio

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
      <WorldScaler />
      {inXR && <WristMenu />}
      {!inXR && <OrbitControls makeDefault enabled={!dragging} target={WORLD_ROOT.position} />}

      <group
        ref={(g) => {
          worldRootRef.current = g
        }}
        position={WORLD_ROOT.position}
        scale={ratio}
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

/**
 * Places the world for the chosen scale preset relative to where you are: when the preset changes
 * and when an XR session starts (your head is somewhere else once the headset is on).
 * Writes WORLD_ROOT.position too, so re-renders and the map grab start from the same spot.
 */
function WorldScaler() {
  const worldScale = useEditor((s) => s.worldScale)
  const session = useXR((s) => s.session)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    placement.pending = true
  }, [worldScale, session])

  // Placed from the frame loop so the XR camera already has its head pose.
  useFrame(() => {
    const root = worldRootRef.current
    if (!placement.pending || !root) return
    placement.pending = false
    const head = camera.getWorldPosition(new THREE.Vector3())
    const forward = camera.getWorldDirection(new THREE.Vector3())
    const at = worldPlacement(worldScale, head, forward, useWorld.getState().robotStart)
    root.position.copy(at)
    root.quaternion.identity()
    WORLD_ROOT.position.copy(at)
  })
  return null
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
