import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getWebXRManager } from './session'
import { useRoom, usableLabel, type RoomObstacle, type RoomSurface, type XZ } from './room'

/** How often to re-read the room (s). Space Setup data rarely changes during a session. */
const INTERVAL = 0.5
const m = new THREE.Matrix4()
const v = new THREE.Vector3()

/** Mesh labels already covered by planes (or not furniture). */
const NOT_FURNITURE = new Set(['wall', 'floor', 'ceiling', 'global mesh', 'door frame', 'window frame', 'wall art'])

/** Reads Space Setup planes and meshes into `useRoom` (tracking space). Mount inside the XR scene. */
export function RoomTracker() {
  const gl = useThree((s) => s.gl)
  const nextAt = useRef(0)
  useFrame((state, _dt, frame?: XRFrame) => {
    const ref = gl.xr.getReferenceSpace()
    if (!frame || !ref || state.clock.elapsedTime < nextAt.current) return
    nextAt.current = state.clock.elapsedTime + INTERVAL
    const surfaces: RoomSurface[] = []
    const obstacles: RoomObstacle[] = []
    const planes = [...(frame.detectedPlanes ?? [])]
    const meshes = [...((frame as XRFrame & { detectedMeshes?: Iterable<XRMesh> }).detectedMeshes ?? [])]

    for (const plane of planes) {
      const label = (plane.semanticLabel ?? 'surface').toLowerCase()
      if (!usableLabel(label)) continue
      const pose = frame.getPose(plane.planeSpace, ref)
      if (!pose || plane.polygon.length < 3) continue
      m.fromArray(pose.transform.matrix)
      const pts = plane.polygon.map((p) => v.set(p.x, p.y, p.z).applyMatrix4(m).toArray() as [number, number, number])
      if (plane.orientation === 'horizontal') {
        surfaces.push({ label, y: pts.reduce((s, p) => s + p[1], 0) / pts.length, polygon: pts.map((p) => [p[0], p[2]] as XZ) })
      } else {
        // A wall: its two farthest-apart corners in xz.
        let a: XZ = [pts[0][0], pts[0][2]]
        let b = a
        let best = -1
        for (const p of pts) for (const q of pts) {
          const d = Math.hypot(p[0] - q[0], p[2] - q[2])
          if (d > best) [best, a, b] = [d, [p[0], p[2]], [q[0], q[2]]]
        }
        obstacles.push({ kind: 'segment', label, a, b })
      }
    }

    for (const mesh of meshes) {
      const label = (mesh.semanticLabel ?? 'object').toLowerCase()
      if (NOT_FURNITURE.has(label)) continue
      const pose = frame.getPose(mesh.meshSpace, ref)
      if (!pose || mesh.vertices.length < 9) continue
      m.fromArray(pose.transform.matrix)
      const min: XZ = [Infinity, Infinity]
      const max: XZ = [-Infinity, -Infinity]
      let top = -Infinity
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        v.set(mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]).applyMatrix4(m)
        min[0] = Math.min(min[0], v.x)
        min[1] = Math.min(min[1], v.z)
        max[0] = Math.max(max[0], v.x)
        max[1] = Math.max(max[1], v.z)
        top = Math.max(top, v.y)
      }
      obstacles.push({ kind: 'box', label, min, max, top })
      surfaces.push({ label, y: top, polygon: [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]] })
    }

    const prev = useRoom.getState()
    if (prev.planes !== planes.length || prev.meshes !== meshes.length)
      console.log('[RealmForge] room:', { planes: planes.length, meshes: meshes.length, surfaces: surfaces.length, obstacles: obstacles.length })
    useRoom.setState({ surfaces, obstacles, planes: planes.length, meshes: meshes.length })
  })
  return null
}

/** Open Quest's Space Setup from inside the app (Quest Browser only). Returns false where unsupported. */
export function scanRoom(): boolean {
  const session = getWebXRManager()?.getSession() as (XRSession & { initiateRoomCapture?: () => Promise<void> }) | null | undefined
  if (!session?.initiateRoomCapture) {
    console.warn('[RealmForge] Scan room: not supported here. Use Settings > Physical Space > Space Setup.')
    return false
  }
  session.initiateRoomCapture().catch((err) => console.warn('[RealmForge] Scan room failed', err))
  return true
}
