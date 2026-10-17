import { Actors } from '../actors/Actors'
import { ControlPalette } from '../xr/ControlPalette'
import { ControlsGuidePanel } from '../xr/ControlsGuidePanel'
import { useEffect, useMemo } from 'react'
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
import { ThumbnailCapture } from './ThumbnailCapture'
import { MenuButton, WristMenu } from '../editor/WristMenu'
import { MocapSkeleton } from '../mocap/MocapSkeleton'
import { toggleMocap, useMocap } from '../mocap/store'
import { SCALE_PRESETS, WORLD_ROOT, placement, worldPlacement, worldRootRef } from './worldRoot'
import { WorldPlacement } from '../xr/WorldPlacement'
import { bindWebXRManager } from '../xr/session'
import { useEnvironment } from '../world/environment'
import { usePlacement } from '../xr/placement'
import { WristEnvMenu } from '../editor/WristEnvMenu'

export function Scene() {
  const background = useEnvironment((s) => s.appearance.lighting.background)
  const dragging = useWorld((s) => s.dragging)
  const inXR = useXR((s) => s.session != null)
  const mode = useXR((s) => s.mode)
  const gl = useThree((s) => s.gl)
  const placementPos = usePlacement((s) => s.position)
  const orbitTarget = useMemo(() => new THREE.Vector3(...placementPos), [placementPos])
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio
  const mocapOn = useMocap((s) => s.enabled)
  const mocapInMap = useMocap((s) => s.placement === 'map')
  const robotStart = useWorld((s) => s.robotStart)

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
      {inXR && (
        <WristMenu
          extra={
            <>
              <WristEnvMenu />
              <group position={[0, -0.032, 0]}>
                <MocapMenuButton />
              </group>
            </>
          }
        />
      )}
      {mocapOn && !mocapInMap && <MocapSkeleton />}
      {/* Right-click is reserved for the desktop context menu; middle-drag pans. */}
      {!inXR && (
        <OrbitControls
          makeDefault
          enabled={!dragging}
          target={orbitTarget}
          target={WORLD_ROOT.position}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: -1 as THREE.MOUSE,
          }}
        />
      )}

      <ControlPalette />
      <ControlsGuidePanel />
      <WorldPlacement>
        <group
          ref={(g) => {
            worldRootRef.current = g
          }}
          scale={ratio}
          onPointerMove={dragMove}
          onPointerUp={onUp}
        >
          <DragCatcher />
          <Ground />
          <Obstacles />
          <Route />
          <Robot />
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
 * Places the world for the chosen scale preset relative to the viewer.
 * Skips when AR "Place city" has pinned / is choosing a plane — that pose owns presentation.
 * Writes WORLD_ROOT.position and the free placement pose so desktop orbit and recenter stay in sync.
 */
function WorldScaler() {
  const worldScale = useEditor((s) => s.worldScale)
  const session = useXR((s) => s.session)
  const camera = useThree((s) => s.camera)
  const pinStatus = usePlacement((s) => s.status)

  useEffect(() => {
    placement.pending = true
  }, [worldScale, session])

  useFrame(() => {
    if (!placement.pending) return
    if (pinStatus !== 'free') {
      placement.pending = false
      return
    }
    placement.pending = false
    const head = camera.getWorldPosition(new THREE.Vector3())
    const forward = camera.getWorldDirection(new THREE.Vector3())
    const at = worldPlacement(worldScale, head, forward, useWorld.getState().robotStart)
    WORLD_ROOT.position.copy(at)
    usePlacement.setState({ position: [at.x, at.y, at.z] })
  })
  return null
}

/** Wrist-menu toggle for the Smartsuit stream, showing its status. */
function MocapMenuButton() {
  const enabled = useMocap((s) => s.enabled)
  const status = useMocap((s) => s.status)
  return <MenuButton label={enabled ? `Mocap ${status}` : 'Mocap off'} active={enabled && status === 'live'} onPress={toggleMocap} />
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
