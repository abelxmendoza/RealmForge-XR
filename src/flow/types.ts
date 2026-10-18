import type { Vec2, Vec3 } from '../world/types'

/** How the user authored the route intent. */
export type RouteMode = 'manual' | 'waypoint' | 'automatic'

/**
 * Validity of a planned route against current geometry.
 * User waypoints (intent) are never mutated by replanning — only status + trajectory change.
 */
export type RouteStatus = 'draft' | 'valid' | 'replanned' | 'blocked' | 'unreachable'

/** Authoritative user intent: ordered visit points in world-local metres [x,z]. */
export interface PlannedRoute {
  id: string
  name: string
  mode: RouteMode
  /** User-defined visit order. Never rewritten by A*. */
  waypoints: Vec2[]
  /** Agent ids assigned to follow this route ('robot' for the primary robot). */
  assignedAgentIds: string[]
  status: RouteStatus
  /**
   * Regenerated execution path through the waypoints (world [x,z]).
   * Not authoritative — recomputed after load and on geometry changes.
   */
  trajectory: Vec2[]
  /** Optional short reason when status is blocked / unreachable. */
  message?: string
  visible: boolean
}

export type TrafficZoneType = 'one-way' | 'restricted' | 'slow' | 'stop' | 'queue' | 'no-go'

/** Editable traffic-control volume in world-local space. */
export interface TrafficZone {
  id: string
  name: string
  type: TrafficZoneType
  position: Vec3
  size: Vec3
  rotationY: number
  /** Travel direction for one-way lanes (xz). */
  direction?: Vec2
  /** m/s hint for slow zones (simulation may ignore in MVP). */
  speedLimit?: number
  /** Agent kinds barred from restricted zones (empty = all). */
  restrictedAgents?: string[]
}

/** Portable slice persisted with a world file. */
export interface FlowSnapshot {
  routes: PlannedRoute[]
  trafficZones: TrafficZone[]
}

export const ROUTE_COLORS = {
  draft: '#6ea8fe',
  valid: '#4cc9f0',
  replanned: '#ffd166',
  blocked: '#ef476f',
  unreachable: '#ef476f',
  reserved: '#9b5de5',
  intent: '#6ea8fe',
} as const
