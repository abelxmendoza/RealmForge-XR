import { create } from 'zustand'
import type { Vec3 } from '../world/types'
import { fitPosition, type ScanAnalysis } from './analyze'

/** Portable alignment metadata. Model bytes live in IndexedDB or a property bundle. */
export interface ScanSettings {
  id: string
  name: string
  bytes: number
  analysis: ScanAnalysis
  scale: number
  rotationY: number
  /** Metres relative to the property origin; Y is this section's floor elevation. */
  offset: Vec3
  opacity: number
  visible: boolean
  /** Height above this section's own floor, not above the property origin. */
  cutHeight: number | null
  /** Optional user label, e.g. Ground floor, Upstairs, or Outdoors. */
  level?: string
  /** Walls and furniture at ground level block the robot, attendees and routes (default on). */
  blocks?: boolean
}

export const MAX_PROPERTY_SCANS = 24
export const MAX_PROPERTY_BYTES = 250 * 1024 * 1024
export type ScanStatus = 'none' | 'loading' | 'ready' | 'missing' | 'error'
export interface ScanRuntime { status: ScanStatus; message: string | null; modelVersion: number }
interface ScanState {
  scans: ScanSettings[]
  activeId: string | null
  runtime: Record<string, ScanRuntime>
  /** Selected-section aliases retained for existing callers / single-scan saves. */
  scan: ScanSettings | null
  status: ScanStatus
  message: string | null
  panelOpen: boolean
  measuring: boolean
  measurePoints: Vec3[]
  version: number
  modelVersion: number
  /** Changes on world replacement; asynchronous imports must not land in another world. */
  generation: number
  /** Where scans block movement now (x,z pairs in metres), for the overlay; null when nothing blocks. */
  blockers: Float32Array | null
}

export const useScan = create<ScanState>(() => ({
  scans: [], activeId: null, runtime: {}, scan: null, status: 'none', message: null,
  panelOpen: false, measuring: false, measurePoints: [], version: 0, modelVersion: 0, generation: 0, blockers: null,
}))

function selection(scans: ScanSettings[], activeId: string | null, runtime: Record<string, ScanRuntime>) {
  const scan = scans.find((s) => s.id === activeId) ?? null
  const r = scan ? runtime[scan.id] : undefined
  return { scan, activeId: scan?.id ?? null, status: r?.status ?? 'none' as ScanStatus, message: r?.message ?? null }
}

/** Replace the property; also used to migrate a legacy single-scan save. */
export function setScans(scans: ScanSettings[], activeId: string | null = scans[0]?.id ?? null, status: ScanStatus = 'loading') {
  const ids = new Set(scans.map((s) => s.id))
  if (ids.size !== scans.length || scans.length > MAX_PROPERTY_SCANS || scans.reduce((n, s) => n + s.bytes, 0) > MAX_PROPERTY_BYTES) throw new Error('Property scan limits exceeded or duplicate scan IDs.')
  scans = structuredClone(scans)
  useScan.setState((s) => {
    const runtime = Object.fromEntries(scans.map((scan) => [scan.id, { status, message: null, modelVersion: s.modelVersion + 1 }]))
    const picked = ids.has(activeId ?? '') ? activeId : scans[0]?.id ?? null
    return { scans, runtime, ...selection(scans, picked, runtime), measuring: false, measurePoints: [], version: s.version + 1, modelVersion: s.modelVersion + 1, generation: s.generation + 1 }
  })
}

export function setScan(scan: ScanSettings | null, status: ScanStatus = scan ? 'loading' : 'none', message: string | null = null) {
  setScans(scan ? [scan] : [], scan?.id ?? null, status)
  if (scan && message) setScanStatus(status, message, scan.id)
}

/** Adds or re-links one section without replacing its neighbours. */
export function installScan(scan: ScanSettings, status: ScanStatus = 'ready') {
  useScan.setState((s) => {
    const scans = s.scans.some((item) => item.id === scan.id) ? s.scans.map((item) => item.id === scan.id ? scan : item) : [...s.scans, scan]
    if (scans.length > MAX_PROPERTY_SCANS || scans.reduce((n, item) => n + item.bytes, 0) > MAX_PROPERTY_BYTES) throw new Error('Property limit: 24 sections and 250 MB total. Export lighter meshes or split the property.')
    const runtime = { ...s.runtime, [scan.id]: { status, message: null, modelVersion: s.modelVersion + 1 } }
    return { scans, runtime, ...selection(scans, scan.id, runtime), measuring: false, measurePoints: [], version: s.version + 1, modelVersion: s.modelVersion + 1 }
  })
}

export function selectScan(id: string) {
  useScan.setState((s) => s.scans.some((scan) => scan.id === id) ? { ...selection(s.scans, id, s.runtime), measuring: false, measurePoints: [] } : s)
}

export function removeScan(id = useScan.getState().activeId) {
  useScan.setState((s) => {
    const scans = s.scans.filter((scan) => scan.id !== id)
    if (scans.length === s.scans.length) return s
    const runtime = { ...s.runtime }; if (id) delete runtime[id]
    return { scans, runtime, ...selection(scans, s.activeId === id ? scans[0]?.id ?? null : s.activeId, runtime), measuring: false, measurePoints: [], version: s.version + 1 }
  })
}

export function patchScan(patch: Partial<Omit<ScanSettings, 'id' | 'analysis' | 'bytes'>>, id = useScan.getState().activeId) {
  useScan.setState((s) => {
    const scans = s.scans.map((scan) => scan.id === id ? { ...scan, ...patch } : scan)
    return { scans, ...selection(scans, s.activeId, s.runtime), measuring: false, measurePoints: [], version: s.version + 1 }
  })
}

export function setScanStatus(status: ScanStatus, message: string | null = null, id = useScan.getState().activeId) {
  if (!id) return
  useScan.setState((s) => {
    if (!s.scans.some((scan) => scan.id === id)) return s
    const runtime = { ...s.runtime, [id]: { ...s.runtime[id], status, message } }
    return { runtime, ...selection(s.scans, s.activeId, runtime) }
  })
}

export function openScanPanel(open = true) {
  useScan.setState({ panelOpen: open, ...(open ? {} : { measuring: false, measurePoints: [] }) })
}
export function startMeasuring(on = true) {
  const s = useScan.getState()
  useScan.setState({ measuring: on && !!s.scan?.visible, measurePoints: [] })
}
export function addMeasurePoint(p: Vec3) {
  useScan.setState((s) => s.measuring ? { measurePoints: s.measurePoints.length >= 2 ? [p] : [...s.measurePoints, [...p] as Vec3] } : s)
}
export function scanPosition(scan: ScanSettings): Vec3 {
  return fitPosition(scan.analysis, scan.scale, scan.rotationY, scan.offset)
}
export function scanForSave(): ScanSettings | undefined {
  const s = useScan.getState().scan
  return s ? structuredClone(s) : undefined
}
export function scansForSave(): ScanSettings[] { return structuredClone(useScan.getState().scans) }
