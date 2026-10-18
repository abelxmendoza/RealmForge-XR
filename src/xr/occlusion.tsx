import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { XRMeshModel, XRPlaneModel, XRSpace, useXRMeshes, useXRPlanes } from '@react-three/xr'
import * as THREE from 'three'
import { create } from 'zustand'
import { useEditor } from '../editor/settings'

/**
 * Occlusion: virtual objects hidden behind real ones. Off by default; toggle with O, the HUD or the wrist.
 *
 * - **depth** (Quest 3 / 3S): the headset's live depth map. three.js draws it into the depth buffer before
 *   the scene whenever the session has GPU depth sensing, so hands, people and furniture all hide what's
 *   behind them. Toggling just shows or hides that mesh.
 * - **room** (Quest 2, no depth sensor): the Space Setup walls, tables, couches and room mesh drawn as
 *   invisible depth-only blockers. These don't move, so hands and people don't occlude.
 * - **none**: on, but the session has neither (no depth and no room set up / not granted).
 */
export type OcclusionSource = 'off' | 'depth' | 'room' | 'none'

export function occlusionSource(s: { enabled: boolean; hasDepth: boolean; planes: number; meshes: number }): OcclusionSource {
  if (!s.enabled) return 'off'
  if (s.hasDepth) return 'depth'
  return s.planes + s.meshes > 0 ? 'room' : 'none'
}

/** Labels never used as blockers: the floor (and ceiling) would hide the ground and low objects like pallets. */
const SKIP_LABELS = new Set(['floor', 'ceiling', 'global mesh'])
export const blocksView = (label: string | undefined) => !SKIP_LABELS.has((label ?? '').toLowerCase())

export const useOcclusion = create<{ hasDepth: boolean; source: OcclusionSource }>(() => ({ hasDepth: false, source: 'off' }))

export const toggleOcclusion = () => useEditor.getState().set({ occlusion: !useEditor.getState().occlusion })

/** Depth-only: writes depth so real surfaces hide what's behind them, but draws no colour (passthrough stays). */
const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide })
const noHit = () => null

/** Mount inside the XR scene. Switches the depth mesh and, without depth, draws the room blockers. */
export function Occlusion() {
  const gl = useThree((s) => s.gl)
  const enabled = useEditor((s) => s.occlusion)
  const hasDepth = useOcclusion((s) => s.hasDepth)
  const planes = useXRPlanes().filter((p) => blocksView(p.semanticLabel))
  const meshes = useXRMeshes().filter((m) => blocksView(m.semanticLabel))

  useFrame(() => {
    const xr = gl.xr
    const depth = xr.isPresenting && xr.hasDepthSensing()
    if (depth !== useOcclusion.getState().hasDepth) useOcclusion.setState({ hasDepth: depth })
    if (depth) {
      const mesh = xr.getDepthSensingMesh()
      if (mesh) mesh.visible = useEditor.getState().occlusion
    }
  })

  const source = occlusionSource({ enabled, hasDepth, planes: planes.length, meshes: meshes.length })
  useEffect(() => {
    useOcclusion.setState({ source })
    console.log('[RealmForge] occlusion:', source, { planes: planes.length, meshes: meshes.length })
  }, [source, planes.length, meshes.length])

  if (source !== 'room') return null
  return (
    <group>
      {planes.map((plane, i) => (
        <XRSpace key={`p${i}-${plane.lastChangedTime}`} space={plane.planeSpace}>
          <XRPlaneModel plane={plane} material={occluderMaterial} renderOrder={-1} raycast={noHit} />
        </XRSpace>
      ))}
      {meshes.map((mesh, i) => (
        <XRSpace key={`m${i}-${mesh.lastChangedTime}`} space={mesh.meshSpace}>
          <XRMeshModel mesh={mesh} material={occluderMaterial} renderOrder={-1} raycast={noHit} />
        </XRSpace>
      ))}
    </group>
  )
}
