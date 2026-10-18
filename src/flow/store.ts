import { create } from 'zustand'
import type { PlannedRoute, TrafficZone } from './types'
import type { Vec2 } from '../world/types'

export type FlowDraft = {
  mode: PlannedRoute['mode']
  waypoints: Vec2[]
  name: string
} | null

export interface FlowState {
  routes: Record<string, PlannedRoute>
  trafficZones: Record<string, TrafficZone>
  selectedRouteId: string | null
  selectedZoneId: string | null
  draft: FlowDraft
  /** Show route overlays in the scene. */
  showRoutes: boolean
  /** Show traffic zone volumes. */
  showZones: boolean
  /** Last pointer hit on the ground (desktop cursor / XR aim) for voice spatial commands. */
  pointerTarget: Vec2 | null
  /** Routes currently driving robot navigation. */
  activeRouteId: string | null
  /** Simulation pause flag for voice "pause/resume". */
  simulationPaused: boolean
  /** Bumped when flow data changes (dirty tracking / UI). */
  version: number

  setRoutes: (routes: Record<string, PlannedRoute>) => void
  upsertRoute: (route: PlannedRoute) => void
  removeRoute: (id: string) => void
  setZones: (zones: Record<string, TrafficZone>) => void
  upsertZone: (zone: TrafficZone) => void
  removeZone: (id: string) => void
  selectRoute: (id: string | null) => void
  selectZone: (id: string | null) => void
  setDraft: (draft: FlowDraft) => void
  setShowRoutes: (v: boolean) => void
  setShowZones: (v: boolean) => void
  setPointerTarget: (p: Vec2 | null) => void
  setActiveRouteId: (id: string | null) => void
  setSimulationPaused: (v: boolean) => void
  replaceAll: (routes: PlannedRoute[], zones: TrafficZone[]) => void
  clear: () => void
}

let nextRoute = 1
let nextZone = 1

export const newRouteId = () => `route-${nextRoute++}`
export const newZoneId = () => `zone-${nextZone++}`

export function reserveFlowIds(routes: Iterable<{ id: string }>, zones: Iterable<{ id: string }> = []) {
  for (const r of routes) {
    const m = /^route-(\d+)$/.exec(r.id)
    if (m) nextRoute = Math.max(nextRoute, Number(m[1]) + 1)
  }
  for (const z of zones) {
    const m = /^zone-(\d+)$/.exec(z.id)
    if (m) nextZone = Math.max(nextZone, Number(m[1]) + 1)
  }
}

export const useFlow = create<FlowState>((set) => ({
  routes: {},
  trafficZones: {},
  selectedRouteId: null,
  selectedZoneId: null,
  draft: null,
  showRoutes: true,
  showZones: true,
  pointerTarget: null,
  activeRouteId: null,
  simulationPaused: false,
  version: 0,

  setRoutes: (routes) => set((s) => ({ routes, version: s.version + 1 })),
  upsertRoute: (route) =>
    set((s) => ({ routes: { ...s.routes, [route.id]: route }, version: s.version + 1 })),
  removeRoute: (id) =>
    set((s) => {
      const { [id]: _, ...routes } = s.routes
      return {
        routes,
        selectedRouteId: s.selectedRouteId === id ? null : s.selectedRouteId,
        activeRouteId: s.activeRouteId === id ? null : s.activeRouteId,
        version: s.version + 1,
      }
    }),
  setZones: (trafficZones) => set((s) => ({ trafficZones, version: s.version + 1 })),
  upsertZone: (zone) =>
    set((s) => ({ trafficZones: { ...s.trafficZones, [zone.id]: zone }, version: s.version + 1 })),
  removeZone: (id) =>
    set((s) => {
      const { [id]: _, ...trafficZones } = s.trafficZones
      return {
        trafficZones,
        selectedZoneId: s.selectedZoneId === id ? null : s.selectedZoneId,
        version: s.version + 1,
      }
    }),
  selectRoute: (selectedRouteId) => set({ selectedRouteId, selectedZoneId: null }),
  selectZone: (selectedZoneId) => set({ selectedZoneId, selectedRouteId: null }),
  setDraft: (draft) => set({ draft }),
  setShowRoutes: (showRoutes) => set({ showRoutes }),
  setShowZones: (showZones) => set({ showZones }),
  setPointerTarget: (pointerTarget) => set({ pointerTarget }),
  setActiveRouteId: (activeRouteId) => set({ activeRouteId }),
  setSimulationPaused: (simulationPaused) => set({ simulationPaused }),
  replaceAll: (routes, zones) => {
    reserveFlowIds(routes, zones)
    set((s) => ({
      routes: Object.fromEntries(routes.map((r) => [r.id, r])),
      trafficZones: Object.fromEntries(zones.map((z) => [z.id, z])),
      selectedRouteId: null,
      selectedZoneId: null,
      draft: null,
      activeRouteId: null,
      version: s.version + 1,
    }))
  },
  clear: () =>
    set((s) => ({
      routes: {},
      trafficZones: {},
      selectedRouteId: null,
      selectedZoneId: null,
      draft: null,
      activeRouteId: null,
      version: s.version + 1,
    })),
}))
