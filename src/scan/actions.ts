import { scaleFromMeasurement } from './analyze'
import { DEFAULT_CUT } from './importScan'
import { patchScan, selectScan, startMeasuring, useScan, type ScanSettings } from './store'

/** Sections block movement unless switched off (older saves have no flag). */
export const blocksMovement = (scan: ScanSettings | null | undefined) => !!scan && scan.blocks !== false

/** Web buttons and immersive tiles call the same metre-based actions. */
export function nudgeScan(axis: 0 | 1 | 2, metres: number) {
  const scan = useScan.getState().scan
  if (!scan || !Number.isFinite(metres)) return
  const offset = [...scan.offset] as [number, number, number]
  offset[axis] = Math.round((offset[axis] + metres) * 1000) / 1000
  if (offset.every((n) => Math.abs(n) <= 10000)) patchScan({ offset })
}
export function rotateScan(radians: number) {
  const scan = useScan.getState().scan
  if (scan && Number.isFinite(radians)) patchScan({ rotationY: scan.rotationY + radians })
}
export function scaleScan(factor: number) {
  const scan = useScan.getState().scan
  if (scan && Number.isFinite(factor) && factor > 0) {
    const scale = scan.scale * factor
    if (scale > 1e-5 && scale < 1000) patchScan({ scale })
  }
}
export function calibrateScan(real: number): boolean {
  const { scan, measurePoints } = useScan.getState()
  if (!scan || measurePoints.length !== 2 || !Number.isFinite(real)) return false
  const measured = Math.hypot(...([0, 1, 2] as const).map((i) => measurePoints[1][i] - measurePoints[0][i]))
  const scale = scaleFromMeasurement(scan.scale, measured, real)
  if (scale === null || !Number.isFinite(scale) || scale <= 1e-5 || scale >= 1000) return false
  patchScan({ scale })
  startMeasuring(false)
  return true
}
export function cycleScan() {
  const { scans, activeId } = useScan.getState()
  if (scans.length) selectScan(scans[(scans.findIndex((s) => s.id === activeId) + 1) % scans.length].id)
}
export function soloScan() {
  const { scans, activeId } = useScan.getState()
  for (const scan of scans) patchScan({ visible: scan.id === activeId }, scan.id)
}
export function showAllScans() { for (const scan of useScan.getState().scans) patchScan({ visible: true }, scan.id) }
export interface ScanControl { id: string; label: string; run: () => void; disabled?: boolean; active?: boolean }
export function scanControls(): ScanControl[] {
  const { scan } = useScan.getState()
  return [
    { id: 'west', label: 'West −0.5 m', run: () => nudgeScan(0, -0.5) },
    { id: 'east', label: 'East +0.5 m', run: () => nudgeScan(0, 0.5) },
    { id: 'north', label: 'North −0.5 m', run: () => nudgeScan(2, -0.5) },
    { id: 'south', label: 'South +0.5 m', run: () => nudgeScan(2, 0.5) },
    { id: 'floor-down', label: 'Floor −0.02 m', run: () => nudgeScan(1, -0.02) },
    { id: 'floor-up', label: 'Floor +0.02 m', run: () => nudgeScan(1, 0.02) },
    { id: 'left', label: 'Rotate left 5°', run: () => rotateScan(Math.PI / 36) },
    { id: 'right', label: 'Rotate right 5°', run: () => rotateScan(-Math.PI / 36) },
    { id: 'smaller', label: 'Scale −1%', run: () => scaleScan(1 / 1.01) },
    { id: 'larger', label: 'Scale +1%', run: () => scaleScan(1.01) },
    { id: 'visibility', label: scan?.visible ? 'Hide section' : 'Show section', active: scan?.visible, run: () => { if (scan) patchScan({ visible: !scan.visible }) } },
    { id: 'ceiling', label: scan?.cutHeight === null ? 'Cut ceiling' : 'Show ceiling', active: scan?.cutHeight !== null, run: () => { if (scan) patchScan({ cutHeight: scan.cutHeight === null ? DEFAULT_CUT : null }) } },
    { id: 'blocks', label: blocksMovement(scan) ? 'Walls block: on' : 'Walls block: off', active: blocksMovement(scan), run: () => { if (scan) patchScan({ blocks: !blocksMovement(scan) }) } },
  ].map((control) => ({ ...control, disabled: !scan }))
}
