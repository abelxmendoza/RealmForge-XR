import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { WORLD_ROOT, worldRootRef } from '../scene/worldRoot'
import { usePlacement } from './placement'

/**
 * Where the real floor is, so the grid sits exactly on it at every scale (most visibly at 1:1).
 *
 * With `unbounded` tracking (granted on Quest 2 and 3S) the space's origin is not guaranteed to be at
 * floor height, so y = 0 can float or sink. Two sources, best first:
 * - a detected floor plane from Space Setup (plane-detection, `semanticLabel === 'floor'`);
 * - the `local-floor` reference space, whose origin is on the floor: its height in the active space.
 * With plain `local-floor` tracking both agree with y = 0.
 */
export function floorHeight(input: { localFloorY: number | null; floorPlaneYs: number[] }): number {
  if (input.floorPlaneYs.length) return Math.min(...input.floorPlaneYs)
  if (input.localFloorY !== null && Number.isFinite(input.localFloorY)) return input.localFloorY
  return 0
}

/** Re-snap the world when the floor estimate moves at least this much (m). */
const RESNAP = 0.01
/** How often to re-measure (s). */
const INTERVAL = 0.5

/** Keeps WORLD_ROOT.floorY up to date during an XR session and the world root standing on it. */
export function FloorTracker() {
  const gl = useThree((s) => s.gl)
  const session = useXR((s) => s.session)
  const localFloor = useRef<XRReferenceSpace | null>(null)
  const nextAt = useRef(0)

  useEffect(() => {
    localFloor.current = null
    if (!session) {
      WORLD_ROOT.floorY = 0
      return
    }
    let cancelled = false
    session
      .requestReferenceSpace('local-floor')
      .then((space) => {
        if (!cancelled) localFloor.current = space
      })
      .catch(() => {
        /* local-floor not available: plane detection (or y = 0) is used */
      })
    return () => {
      cancelled = true
    }
  }, [session])

  useFrame((state, _dt, frame?: XRFrame) => {
    const refSpace = gl.xr.getReferenceSpace()
    if (!frame || !refSpace || state.clock.elapsedTime < nextAt.current) return
    nextAt.current = state.clock.elapsedTime + INTERVAL

    let localFloorY: number | null = null
    if (localFloor.current) localFloorY = frame.getPose(localFloor.current, refSpace)?.transform.position.y ?? null
    const floorPlaneYs: number[] = []
    for (const plane of frame.detectedPlanes ?? []) {
      if (plane.semanticLabel !== 'floor') continue
      const y = frame.getPose(plane.planeSpace, refSpace)?.transform.position.y
      if (y !== undefined) floorPlaneYs.push(y)
    }
    const floorY = floorHeight({ localFloorY, floorPlaneYs })
    const moved = Math.abs(floorY - WORLD_ROOT.floorY) >= RESNAP
    WORLD_ROOT.floorY = floorY
    if (moved) console.log('[RealmForge] floor at', floorY.toFixed(3), floorPlaneYs.length ? '(floor plane)' : localFloorY !== null ? '(local-floor)' : '(default)')

    // A pinned world already sits on its plane; otherwise keep the ground on the floor.
    const root = worldRootRef.current
    if (!root || usePlacement.getState().status !== 'free') return
    if (moved || Math.abs(root.position.y - floorY) >= RESNAP) {
      root.position.y = floorY
      WORLD_ROOT.position.y = floorY
    }
  })
  return null
}
