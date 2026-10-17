import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import { SCALE_PRESETS, WORLD_ROOT, onTable, worldRootRef } from '../scene/worldRoot'
import { useEditor } from '../editor/settings'
import { usePlacement } from './placement'

/**
 * Where the real floor is, so room-scale and life-size grids sit on it (most visibly at 1:1).
 *
 * With `unbounded` tracking (Quest 2 / 3S) the space origin is not guaranteed at floor height, so
 * y = 0 can float or sink. Two sources, best first:
 * - a detected floor plane from Space Setup (`semanticLabel === 'floor'`);
 * - the `local-floor` reference space origin in the active space.
 * Tabletop miniatures keep their table height; FloorTracker only snaps floor-scale worlds.
 */
export function floorHeight(input: { localFloorY: number | null; floorPlaneYs: number[] }): number {
  if (input.floorPlaneYs.length) return Math.min(...input.floorPlaneYs)
  if (input.localFloorY !== null && Number.isFinite(input.localFloorY)) return input.localFloorY
  return 0
}

const RESNAP = 0.01
const INTERVAL = 0.5

/** Keeps WORLD_ROOT.floorY up to date during XR and stands floor-scale worlds on it. */
export function FloorTracker() {
  const gl = useThree((s) => s.gl)
  const session = useXR((s) => s.session)
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio
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
        /* plane detection (or y = 0) is used */
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
    if (moved) {
      console.log(
        '[RealmForge] floor at',
        floorY.toFixed(3),
        floorPlaneYs.length ? '(floor plane)' : localFloorY !== null ? '(local-floor)' : '(default)',
      )
    }

    // Tabletop stays at table height; pinned worlds already sit on their plane.
    if (onTable(ratio) || usePlacement.getState().status !== 'free') return
    const root = worldRootRef.current
    if (!root) return
    if (moved || Math.abs(root.position.y - floorY) >= RESNAP) {
      root.position.y = floorY
      WORLD_ROOT.position.y = floorY
    }
  })
  return null
}
