import type { Vec2 } from '../world/types'
import { useFlow } from './store'
import {
  addDraftWaypoint,
  addTrafficZone,
  assignRouteToRobot,
  beginRouteDraft,
  cancelRouteDraft,
  clearRouteAssignment,
  createAutomaticRoute,
  deleteRoute,
  deleteTrafficZone,
  duplicateRoute,
  finishRouteDraft,
  flowSnapshot,
  loadFlowSnapshot,
  moveRouteWaypoint,
  pauseSimulation,
  removeRouteWaypoint,
  renameRoute,
  resumeSimulation,
  reverseRoute,
  revalidateAllRoutes,
  undoDraftWaypoint,
  updateRouteWaypoints,
} from './controller'
import { placementMessage, validatePlacement } from './placement'
import type { RouteMode, TrafficZoneType } from './types'

/** Public Flow Action API — desktop, XR, and voice share these. */
export const flowActions = {
  beginRoute: beginRouteDraft,
  addWaypoint: addDraftWaypoint,
  undoWaypoint: undoDraftWaypoint,
  finishRoute: finishRouteDraft,
  cancelRoute: cancelRouteDraft,
  createAutomaticRoute,
  updateWaypoints: updateRouteWaypoints,
  moveWaypoint: moveRouteWaypoint,
  removeWaypoint: removeRouteWaypoint,
  renameRoute,
  deleteRoute,
  reverseRoute,
  duplicateRoute,
  assignToRobot: assignRouteToRobot,
  clearAssignment: clearRouteAssignment,
  revalidate: revalidateAllRoutes,
  addZone: addTrafficZone,
  deleteZone: deleteTrafficZone,
  pause: pauseSimulation,
  resume: resumeSimulation,
  snapshot: flowSnapshot,
  loadSnapshot: loadFlowSnapshot,
  validatePlacement,
  placementMessage,

  selectRoute: (id: string | null) => useFlow.getState().selectRoute(id),
  setShowRoutes: (v: boolean) => useFlow.getState().setShowRoutes(v),
  setShowZones: (v: boolean) => useFlow.getState().setShowZones(v),
  setPointerTarget: (p: Vec2 | null) => useFlow.getState().setPointerTarget(p),

  /** Resolve the spatial target for voice: pointer → else null (never invent coords). */
  spatialTarget(): Vec2 | null {
    return useFlow.getState().pointerTarget
  },

  getSelectedRoute() {
    const s = useFlow.getState()
    return s.selectedRouteId ? s.routes[s.selectedRouteId] ?? null : null
  },

  beginRouteMode(mode: RouteMode = 'waypoint') {
    beginRouteDraft(mode)
  },

  addZoneAtPointer(type: TrafficZoneType) {
    const at = useFlow.getState().pointerTarget
    if (!at) return { ok: false as const, error: 'Point at the ground first, then say the command.' }
    return { ok: true as const, zone: addTrafficZone(type, at) }
  },
}

export type FlowActions = typeof flowActions
