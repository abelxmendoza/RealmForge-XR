import { WarehouseInterior } from './WarehouseInterior'
import { Actors } from '../actors/Actors'
import { ControlPalette } from '../xr/ControlPalette'
import { ControlsGuidePanel } from '../xr/ControlsGuidePanel'
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
import { Attendee, AttendeeRoute } from '../sim/AttendeeView'
import { Route } from './Route'
import { Lighting } from './Lighting'
import { ThumbnailCapture } from './ThumbnailCapture'
import { MenuButton, WRIST_QUARTER, WristMenu } from '../editor/WristMenu'
import { MocapSkeleton } from '../mocap/MocapSkeleton'
import { GestureController } from '../xr/gestures/GestureController'
import { toggleMocap, useMocap } from '../mocap/store'
import { SCALE_PRESETS, WORLD_ROOT, placement, worldPlacement, worldRootRef } from './worldRoot'
import { WorldPlacement } from '../xr/WorldPlacement'
import { bindWebXRManager } from '../xr/session'
import { useEnvironment } from '../world/environment'
import { usePlacement } from '../xr/placement'
import { FloorTracker } from '../xr/floor'
import { Occlusion } from '../xr/occlusion'

export function Scene() {
  const background = useEnvironment((s) => s.appearance.lighting.background)
  const dragging = useWorld((s) => s.dragging)
  const inXR = useXR((s) => s.session != null)
  const mode = useXR((s) => s.mode)
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio
  const mocapOn = useMocap((s) => s.enabled)
  const mocapInMap = useMocap((s) => s.placement === 'map')
  const robotStart = useWorld((s) => s.robotStart)
  const gl = useThree((s) => s.gl)
  const robotEnabled = useWorld((s) => s.robotEnabled !== false)

  useEffect(() => {
    bindWebXRManager(gl.xr)
    return () => bindWebXRManager(null)
  }, [gl])

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
      {mode !== 'immersive-ar' && <color attach="background" args={[background]} />}
      <Lighting />
      <ThumbnailCapture />
      <WorldScaler />
      {inXR && <FloorTracker />}
      {inXR && <Occlusion />}
      {inXR && <WristMenu extra={<MocapMenuButton />} />}
      {inXR && <GestureController />}
      {/* Smartsuit skeleton at 1:1 in your room (Rokoko's origin = where the XR session started). */}
      {mocapOn && !mocapInMap && <MocapSkeleton />}
      {/* Right-click is reserved for the desktop context menu; middle-drag pans. */}
      {!inXR && (
        <OrbitControls
          makeDefault
          enabled={!dragging}
          target={WORLD_ROOT.position}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: -1 as THREE.MOUSE,
          }}
        />
      )}

      {/* In-VR Control Palette (assets, routes, saves, worlds) and the controls guide. */}
      <ControlPalette />
      <ControlsGuidePanel />

      {/*
        WorldPlacement ("Place city"): identity until you pin the world to a detected table/floor plane,
        then this whole subtree follows that plane (or its anchor). WorldScaler positions the root inside it.
      */}
      <WorldPlacement>
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
          <WarehouseInterior />
          <Obstacles />
          <Route />
          {robotEnabled && <Robot />}
          <AttendeeRoute />
          <Attendee />
          <Actors />
          {mocapOn && mocapInMap && (
            <group position={[robotStart[0], 0, robotStart[1]]}>
              <MocapSkeleton />
            </group>
          )}
        </group>
      </WorldPlacement>
    </>
  )
}

/**
 * Places the world for the chosen scale preset relative to where you are: when the preset changes
 * and when an XR session starts (your head is somewhere else once the headset is on).
 * When "Place city" has pinned the world to a plane, WorldPlacement already carries the pose, so the
 * root just sits at the pinned point (local origin) at the current scale.
 * Writes WORLD_ROOT.position too, so re-renders and the map grab start from the same spot.
 */
function WorldScaler() {
  const worldScale = useEditor((s) => s.worldScale)
  const session = useXR((s) => s.session)
  const pinned = usePlacement((s) => s.status === 'pinned')
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    placement.pending = true
  }, [worldScale, session, pinned])

  // Placed from the frame loop so the XR camera already has its head pose.
  useFrame(() => {
    const root = worldRootRef.current
    if (!placement.pending || !root) return
    // While choosing a plane, WorldPlacement owns the pose; place once it's pinned (or cancelled).
    if (usePlacement.getState().status === 'choosing') return
    placement.pending = false
    let at: THREE.Vector3
    if (usePlacement.getState().status === 'pinned') {
      at = new THREE.Vector3(0, 0, 0)
    } else {
      const head = camera.getWorldPosition(new THREE.Vector3())
      const forward = camera.getWorldDirection(new THREE.Vector3())
      at = worldPlacement(worldScale, head, forward, useWorld.getState().robotStart, WORLD_ROOT.yaw)
      // Stand on the real floor (unbounded tracking's origin isn't necessarily at floor height).
      at.y = WORLD_ROOT.floorY
    }
    root.position.copy(at)
    // Keep the yaw from the L gesture / world pull / map grab.
    root.rotation.set(0, WORLD_ROOT.yaw, 0)
    WORLD_ROOT.position.copy(at)
  })
  return null
}

/** Wrist-menu toggle for the Smartsuit stream, showing its status. */
function MocapMenuButton() {
  const enabled = useMocap((s) => s.enabled)
  const status = useMocap((s) => s.status)
  return <MenuButton width={WRIST_QUARTER} label={enabled ? `Mocap ${status}` : 'Mocap off'} active={enabled && status === 'live'} onPress={toggleMocap} />
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
