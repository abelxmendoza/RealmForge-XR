import { create } from 'zustand'
import type { Vec3 } from '../world/types'
import { fitPosition, type ScanAnalysis } from './analyze'

/**
 * A real-world scan (a .glb from a phone or LiDAR app) shown under the world as a backdrop.
 * Only these settings travel with the world file; the model itself stays in this browser
 * (see blobStore.ts), so a shared world file never carries someone's building scan.
 */
export interface ScanSettings {
  /** Key of the model file in on-device storage. */
  id: string
  name: string
  bytes: number
  analysis: ScanAnalysis
  /** Metres per scan unit. */
  scale: number
  rotationY: number
  /** The user's nudge on top of the automatic fit (metres). */
  offset: Vec3
  opacity: number
  visible: boolean
  /** Cut the model away above this height (metres over the floor) so ceilings don't hide the plan; null shows everything. */
  cutHeight: number | null
}

export type ScanStatus = 'none' | 'loading' | 'ready' | 'missing' | 'error'

interface ScanState {
  scan: ScanSettings | null
  status: ScanStatus
  message: string | null
  panelOpen: boolean
  /** Picking two points on the scan to set its scale. */
  measuring: boolean
  measurePoints: Vec3[]
  /** Bumped on every settings change, for dirty tracking. */
  version: number
  /** Bumped when a (possibly re-linked) model file is installed, so the scene reloads it. */
  modelVersion: number
}

export const useScan = create<ScanState>(() => ({
  scan: null,
  status: 'none',
  message: null,
  panelOpen: false,
  measuring: false,
  measurePoints: [],
  version: 0,
  modelVersion: 0,
}))

export function setScan(scan: ScanSettings | null, status: ScanStatus = scan ? 'loading' : 'none', message: string | null = null) {
  useScan.setState((s) => ({
    scan,
    status,
    message,
    measuring: false,
    measurePoints: [],
    version: s.version + 1,
    modelVersion: s.modelVersion + 1,
  }))
}

export function patchScan(patch: Partial<Omit<ScanSettings, 'id' | 'analysis'>>) {
  useScan.setState((s) => (s.scan ? { scan: { ...s.scan, ...patch }, version: s.version + 1 } : s))
}

export function setScanStatus(status: ScanStatus, message: string | null = null) {
  useScan.setState({ status, message })
}

export function openScanPanel(open = true) {
  useScan.setState({ panelOpen: open, ...(open ? {} : { measuring: false, measurePoints: [] }) })
}

export function startMeasuring(on = true) {
  useScan.setState({ measuring: on, measurePoints: [] })
}

/** Add a picked point; a third pick starts a new pair. */
export function addMeasurePoint(p: Vec3) {
  useScan.setState((s) => ({ measurePoints: s.measurePoints.length >= 2 ? [p] : [...s.measurePoints, p] }))
}

/** Where the scan root goes: floor at y = 0, centred, plus the user's nudge. */
export function scanPosition(scan: ScanSettings): Vec3 {
  return fitPosition(scan.analysis, scan.scale, scan.rotationY, scan.offset)
}

/** The settings as stored in a world file (no runtime state). */
export function scanForSave(): ScanSettings | undefined {
  const s = useScan.getState().scan
  return s ? structuredClone(s) : undefined
}
