import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'
import { create } from 'zustand'
import { useEditor } from '../editor/settings'
import { SCALE_PRESETS, WORLD_ROOT, placement, worldRootRef, type ScaleId } from '../scene/worldRoot'
import { useWorldLibrary } from '../world/persistence'
import { usePlacement } from './placement'

/**
 * Spatial save: a saved world remembers where it sat in your real room, so loading it on the same headset
 * puts every object back in the same real spot.
 *
 * Saving in AR creates a WebXR anchor at the world's pose and asks the headset to persist it
 * (`anchor.requestPersistentHandle()`, Quest Browser). The handle is stored per saved world on this
 * device only, in `localStorage[realmforge.spatial.v1.<id>]`, never in the portable world file.
 * Loading that world (or entering AR with it active) restores the anchor and pins the world to it.
 * Objects are stored relative to the world root, so they follow.
 */
export interface SpatialRecord {
  v: 1
  /** Persistent anchor handle from the headset. */
  uuid: string
  scale: ScaleId
  savedAt: string
}

export const spatialKey = (worldId: string) => `realmforge.spatial.v1.${worldId}`

/** Parse a stored record; null if missing or malformed (pure, tested). */
export function parseSpatialRecord(raw: string | null): SpatialRecord | null {
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as Partial<SpatialRecord>
    if (r.v !== 1 || typeof r.uuid !== 'string' || !r.uuid || typeof r.savedAt !== 'string') return null
    if (typeof r.scale !== 'string' || !(r.scale in SCALE_PRESETS)) return null
    return { v: 1, uuid: r.uuid, scale: r.scale as ScaleId, savedAt: r.savedAt }
  } catch {
    return null
  }
}

export function readSpatial(worldId: string): SpatialRecord | null {
  try {
    return parseSpatialRecord(localStorage.getItem(spatialKey(worldId)))
  } catch {
    return null
  }
}

function writeSpatial(worldId: string, record: SpatialRecord | null) {
  try {
    if (record) localStorage.setItem(spatialKey(worldId), JSON.stringify(record))
    else localStorage.removeItem(spatialKey(worldId))
  } catch {
    /* storage blocked: spatial save just isn't kept */
  }
}

export type SpatialStatus = 'idle' | 'saving' | 'saved' | 'restored' | 'not found' | 'unavailable'
export const useSpatial = create<{ status: SpatialStatus }>(() => ({ status: 'idle' }))

type PersistentSession = XRSession & {
  restorePersistentAnchor?: (uuid: string) => Promise<XRAnchor>
  deletePersistentAnchor?: (uuid: string) => Promise<void>
}
type PersistentAnchor = XRAnchor & { requestPersistentHandle?: () => Promise<string> }

const pos = new THREE.Vector3()
const quat = new THREE.Quaternion()
const scl = new THREE.Vector3()

/** Watches saves and loads; mount inside the XR scene. */
export function SpatialSync() {
  const gl = useThree((s) => s.gl)
  const session = useXR((s) => s.session) as PersistentSession | undefined
  const inAR = useXR((s) => s.mode === 'immersive-ar')
  const pendingSave = useRef<string | null>(null)

  const restore = async (worldId: string) => {
    const record = readSpatial(worldId)
    if (!record || !session) return
    if (!session.restorePersistentAnchor) return useSpatial.setState({ status: 'unavailable' })
    try {
      const anchor = await session.restorePersistentAnchor(record.uuid)
      if (useWorldLibrary.getState().activeId !== worldId) return // switched worlds meanwhile
      WORLD_ROOT.yaw = 0
      useEditor.getState().set({ worldScale: record.scale })
      usePlacement.getState().pinAt([0, 0, 0], [0, 0, 0, 1], 'saved spot', anchor)
      placement.pending = true
      useSpatial.setState({ status: 'restored' })
      console.log('[RealmForge] spatial: restored', worldId)
    } catch (err) {
      useSpatial.setState({ status: 'not found' })
      console.warn('[RealmForge] spatial: saved spot not found (different room, or anchor cleared)', err)
    }
  }

  // Saves and loads, from the world library.
  useEffect(() => {
    if (!session || !inAR) return
    let prev = useWorldLibrary.getState()
    const savedAt = (s: typeof prev, id: string | null) => s.worlds.find((w) => w.id === id)?.savedAt
    const unsub = useWorldLibrary.subscribe((next) => {
      const id = next.activeId
      if (id && id === prev.activeId && savedAt(next, id) !== savedAt(prev, id)) pendingSave.current = id // saved again
      else if (id && id !== prev.activeId) {
        if (readSpatial(id)) void restore(id) // loaded a world with a saved spot
        else {
          const at = Date.parse(savedAt(next, id) ?? '')
          if (Date.now() - at < 3000) pendingSave.current = id // just created / saved as new
        }
      }
      prev = next
    })
    // Entering AR with a saved world already active.
    const active = useWorldLibrary.getState().activeId
    if (active && readSpatial(active)) void restore(active)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, inAR])

  // Anchors are created from the frame loop (they need the current XRFrame).
  useFrame((_s, _dt, frame?: XRFrame) => {
    const worldId = pendingSave.current
    const root = worldRootRef.current
    const ref = gl.xr.getReferenceSpace()
    if (!worldId || !frame || !root || !ref || !session) return
    pendingSave.current = null
    if (!frame.createAnchor) return useSpatial.setState({ status: 'unavailable' })
    root.updateWorldMatrix(true, false)
    root.matrixWorld.decompose(pos, quat, scl)
    useSpatial.setState({ status: 'saving' })
    const old = readSpatial(worldId)
    frame
      .createAnchor(new XRRigidTransform({ x: pos.x, y: pos.y, z: pos.z }, { x: quat.x, y: quat.y, z: quat.z, w: quat.w }), ref)
      ?.then(async (anchor: PersistentAnchor) => {
        if (!anchor.requestPersistentHandle) throw new Error('persistent anchors not supported')
        const uuid = await anchor.requestPersistentHandle()
        writeSpatial(worldId, { v: 1, uuid, scale: useEditor.getState().worldScale, savedAt: new Date().toISOString() })
        if (old && old.uuid !== uuid) await session.deletePersistentAnchor?.(old.uuid).catch(() => {})
        useSpatial.setState({ status: 'saved' })
        console.log('[RealmForge] spatial: saved', worldId)
      })
      .catch((err: unknown) => {
        useSpatial.setState({ status: 'unavailable' })
        console.warn('[RealmForge] spatial save failed', err)
      })
  })

  return null
}
