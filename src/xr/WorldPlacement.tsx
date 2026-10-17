import { useEffect, type ReactNode } from 'react'
import * as THREE from 'three'
import { type ThreeEvent } from '@react-three/fiber'
import {
  useXR,
  useXRStore,
  useXRPlanes,
  XRPlaneModel,
  XRSpace,
  requestXRAnchor,
} from '@react-three/xr'
import { usePlacement, planePickPriority, type QuatTuple, type Vec3Tuple } from './placement'
import { useXRSessionMeta } from './session'

const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3()
const _normal = new THREE.Vector3()

const PLANE_COLORS: Record<string, string> = {
  table: '#ff9800',
  floor: '#4caf50',
  wall: '#2196f3',
  ceiling: '#9c27b0',
  couch: '#e91e63',
}

/**
 * While "Place city" is active, show detected planes and pin WORLD_ROOT on click.
 * When an anchor exists, the world root is parented under that XRSpace.
 */
export function WorldPlacement({ children }: { children: ReactNode }) {
  const status = usePlacement((s) => s.status)
  const position = usePlacement((s) => s.position)
  const quaternion = usePlacement((s) => s.quaternion)
  const anchor = usePlacement((s) => s.anchor)
  const session = useXR((s) => s.session)
  const inAR = useXR((s) => s.mode === 'immersive-ar')

  // Session ended → drop anchor handle (the UA already invalidated it).
  useEffect(() => {
    if (session != null) return
    const p = usePlacement.getState()
    if (p.anchor) usePlacement.setState({ anchor: null })
    useXRSessionMeta.getState().clear()
    if (p.status === 'choosing') usePlacement.setState({ status: p.surfaceLabel ? 'pinned' : 'free' })
  }, [session])

  const content = (
    <group
      position={anchor ? ([0, 0, 0] as Vec3Tuple) : position}
      quaternion={anchor ? ([0, 0, 0, 1] as QuatTuple) : quaternion}
    >
      {children}
    </group>
  )

  return (
    <>
      {inAR && status === 'choosing' && <PlaneChooser />}
      {anchor ? <XRSpace space={anchor.anchorSpace}>{content}</XRSpace> : content}
    </>
  )
}

function PlaneChooser() {
  const planes = useXRPlanes()
  const store = useXRStore()
  const ranked = [...planes].sort(
    (a, b) => planePickPriority(a.semanticLabel) - planePickPriority(b.semanticLabel),
  )

  return (
    <>
      {ranked.map((plane, i) => (
        <PlanePickTarget key={planeKey(plane, i)} plane={plane} store={store} />
      ))}
    </>
  )
}

function planeKey(plane: XRPlane, index: number) {
  return `${plane.semanticLabel ?? 'plane'}-${plane.lastChangedTime}-${index}`
}

function PlanePickTarget({
  plane,
  store,
}: {
  plane: XRPlane
  store: ReturnType<typeof useXRStore>
}) {
  const label = plane.semanticLabel ?? 'surface'
  const color = PLANE_COLORS[label] ?? '#aaaaaa'

  const onPick = async (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    e.object.updateWorldMatrix(true, false)
    e.object.matrixWorld.decompose(_pos, _quat, _scale)
    _normal.set(0, 1, 0).applyQuaternion(_quat).normalize()
    // City belongs on a table/floor, not a wall.
    if (_normal.y < 0.8) return

    const position: Vec3Tuple = [
      e.point.x + _normal.x * 0.002,
      e.point.y + _normal.y * 0.002,
      e.point.z + _normal.z * 0.002,
    ]
    const quaternion: QuatTuple = [_quat.x, _quat.y, _quat.z, _quat.w]

    let anchor: XRAnchor | null = null
    try {
      anchor =
        (await requestXRAnchor(store, {
          relativeTo: 'world',
          worldPosition: new THREE.Vector3(...position),
          worldQuaternion: new THREE.Quaternion(...quaternion),
        })) ?? null
    } catch (err) {
      console.warn('[RealmForge] anchor create failed; pinning without anchor', err)
    }

    usePlacement.getState().pinAt(position, quaternion, label, anchor)
    console.log('[RealmForge] city pinned to', label, { position, hasAnchor: !!anchor })
  }

  return (
    <XRSpace space={plane.planeSpace}>
      <XRPlaneModel plane={plane} onPointerDown={onPick}>
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </XRPlaneModel>
    </XRSpace>
  )
}
