import type * as THREE from 'three'
import type { PanelLayout } from './layout'

/**
 * Dev / test only: where each named XR panel is and what's on it, so the emulated-headset tests (e2e/)
 * can aim a controller ray at a button by id. Never read by the app itself.
 */
export interface RegisteredPanel {
  group: THREE.Object3D
  layout: PanelLayout
  /** Controls a pointer is over right now (tests wait for the ray to land before pulling the trigger). */
  hover: string[]
  metersPerPx: number
  /** Height of the panel's top edge above the group origin (m). */
  top: number
}
export const panelRegistry = new Map<string, RegisteredPanel>()
/** Every press a panel saw, and whether it went through (tests read this to tell a missed ray from a blocked press). */
export const pressLog: { panel: string; id: string; pointerId: number; accepted: boolean }[] = []

/** World position of the centre of control `id` on panel `name`, or null if it isn't showing. */
export function controlWorldPoint(name: string, id: string): [number, number, number] | null {
  const panel = panelRegistry.get(name)
  const hit = panel?.layout.hits.find((h) => h.id === id)
  if (!panel || !hit) return null
  for (let o: THREE.Object3D | null = panel.group; o; o = o.parent) if (!o.visible) return null
  panel.group.updateWorldMatrix(true, false)
  const e = panel.group.matrixWorld.elements
  const x = (hit.rect.x + hit.rect.w / 2 - panel.layout.width / 2) * panel.metersPerPx
  const y = panel.top - (hit.rect.y + hit.rect.h / 2) * panel.metersPerPx
  return [e[0] * x + e[4] * y + e[12], e[1] * x + e[5] * y + e[13], e[2] * x + e[6] * y + e[14]]
}

/** Centre of panel `name` and its facing normal (world space), or null if it isn't showing. */
export function panelCenter(name: string) {
  const panel = panelRegistry.get(name)
  if (!panel || !panel.group.visible) return null
  let o: THREE.Object3D | null = panel.group
  for (; o; o = o.parent) if (!o.visible) return null
  panel.group.updateWorldMatrix(true, false)
  const e = panel.group.matrixWorld.elements
  const y = panel.top - (panel.layout.height * panel.metersPerPx) / 2
  const n = Math.hypot(e[8], e[9], e[10]) || 1
  return { x: e[4] * y + e[12], y: e[5] * y + e[13], z: e[6] * y + e[14], nx: e[8] / n, ny: e[9] / n, nz: e[10] / n }
}
