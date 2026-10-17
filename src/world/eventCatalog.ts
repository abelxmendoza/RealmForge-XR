/**
 * Universal event object catalog — shared across job fair, conference, wedding, etc.
 * Placement creates `kind: 'prop'` world objects with catalogId + simulationRole.
 */

import type { SimulationRole, Vec3, WorldObject } from './types'

export type EventCatalogCategory = 'furniture' | 'structure' | 'equipment' | 'wayfinding'

export interface EventCatalogEntry {
  id: string
  label: string
  category: EventCatalogCategory
  /** Default footprint + height. */
  size: Vec3
  color: string
  simulationRole: SimulationRole
  /** Default navigation blocking. */
  blocksNavigation: boolean
  capacity?: number
  serviceDuration?: number
  /** Simple procedural mesh hint for the renderer. */
  mesh: 'box' | 'cylinder' | 'booth' | 'stage' | 'sign' | 'barrier' | 'desk'
}

export const EVENT_CATALOG: EventCatalogEntry[] = [
  // Furniture (P0)
  {
    id: 'table-rect-m',
    label: 'Rectangular table',
    category: 'furniture',
    size: [1.8, 0.75, 0.9],
    color: '#c4a574',
    simulationRole: 'decoration',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'table-round-6',
    label: 'Round table (6)',
    category: 'furniture',
    size: [1.6, 0.75, 1.6],
    color: '#d2b48c',
    simulationRole: 'seating',
    blocksNavigation: true,
    capacity: 6,
    mesh: 'cylinder',
  },
  {
    id: 'chair-folding',
    label: 'Folding chair',
    category: 'furniture',
    size: [0.45, 0.9, 0.5],
    color: '#5b6b7c',
    simulationRole: 'seating',
    blocksNavigation: false,
    capacity: 1,
    mesh: 'box',
  },
  {
    id: 'cocktail-table',
    label: 'Cocktail table',
    category: 'furniture',
    size: [0.7, 1.1, 0.7],
    color: '#e8dcc8',
    simulationRole: 'decoration',
    blocksNavigation: true,
    mesh: 'cylinder',
  },
  {
    id: 'registration-desk',
    label: 'Registration desk',
    category: 'furniture',
    size: [2.4, 1.05, 0.8],
    color: '#3d5a80',
    simulationRole: 'registration',
    blocksNavigation: true,
    capacity: 2,
    serviceDuration: 2.5,
    mesh: 'desk',
  },
  // Structures (P0)
  {
    id: 'exhibition-booth',
    label: 'Exhibition booth',
    category: 'structure',
    size: [3, 2.4, 2],
    color: '#e9ecef',
    simulationRole: 'booth',
    blocksNavigation: true,
    capacity: 3,
    serviceDuration: 3,
    mesh: 'booth',
  },
  {
    id: 'booth-wall',
    label: 'Booth wall',
    category: 'structure',
    size: [2.5, 2.2, 0.12],
    color: '#dee2e6',
    simulationRole: 'obstacle',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'stage',
    label: 'Stage',
    category: 'structure',
    size: [6, 0.6, 3.5],
    color: '#495057',
    simulationRole: 'stage',
    blocksNavigation: true,
    capacity: 20,
    serviceDuration: 4,
    mesh: 'stage',
  },
  {
    id: 'backdrop',
    label: 'Backdrop',
    category: 'structure',
    size: [4, 2.5, 0.15],
    color: '#1d3557',
    simulationRole: 'decoration',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'partition',
    label: 'Partition',
    category: 'structure',
    size: [3, 2, 0.1],
    color: '#adb5bd',
    simulationRole: 'obstacle',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'dance-floor',
    label: 'Dance floor',
    category: 'structure',
    size: [5, 0.05, 5],
    color: '#212529',
    simulationRole: 'decoration',
    blocksNavigation: false,
    mesh: 'box',
  },
  // Equipment
  {
    id: 'speaker',
    label: 'Speaker',
    category: 'equipment',
    size: [0.5, 1.2, 0.5],
    color: '#212529',
    simulationRole: 'decoration',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'projection-screen',
    label: 'Projection screen',
    category: 'equipment',
    size: [3.5, 2.2, 0.12],
    color: '#f8f9fa',
    simulationRole: 'decoration',
    blocksNavigation: true,
    mesh: 'box',
  },
  {
    id: 'mic-stand',
    label: 'Microphone stand',
    category: 'equipment',
    size: [0.35, 1.6, 0.35],
    color: '#868e96',
    simulationRole: 'decoration',
    blocksNavigation: false,
    mesh: 'cylinder',
  },
  {
    id: 'dj-booth',
    label: 'DJ booth',
    category: 'equipment',
    size: [2, 1.1, 1],
    color: '#343a40',
    simulationRole: 'service',
    blocksNavigation: true,
    serviceDuration: 2,
    mesh: 'desk',
  },
  // Wayfinding / safety
  {
    id: 'queue-barrier',
    label: 'Queue barrier',
    category: 'wayfinding',
    size: [1.2, 1, 0.15],
    color: '#ced4da',
    simulationRole: 'queue',
    blocksNavigation: true,
    mesh: 'barrier',
  },
  {
    id: 'directional-sign',
    label: 'Directional sign',
    category: 'wayfinding',
    size: [0.8, 1.8, 0.2],
    color: '#4dabf7',
    simulationRole: 'decoration',
    blocksNavigation: false,
    mesh: 'sign',
  },
  {
    id: 'entrance-marker',
    label: 'Entrance marker',
    category: 'wayfinding',
    size: [1.2, 0.15, 1.2],
    color: '#51cf66',
    simulationRole: 'entrance',
    blocksNavigation: false,
    mesh: 'box',
  },
  {
    id: 'exit-marker',
    label: 'Exit marker',
    category: 'wayfinding',
    size: [1.2, 0.15, 1.2],
    color: '#ff6b6b',
    simulationRole: 'exit',
    blocksNavigation: false,
    mesh: 'box',
  },
]

const BY_ID = Object.fromEntries(EVENT_CATALOG.map((e) => [e.id, e])) as Record<string, EventCatalogEntry>

export function getEventCatalogEntry(id: string): EventCatalogEntry | undefined {
  return BY_ID[id]
}

export function listEventCatalog(category?: EventCatalogCategory): EventCatalogEntry[] {
  return category ? EVENT_CATALOG.filter((e) => e.category === category) : EVENT_CATALOG
}

export const EVENT_CATALOG_CATEGORIES: { id: EventCatalogCategory; label: string }[] = [
  { id: 'furniture', label: 'Furniture' },
  { id: 'structure', label: 'Structures' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'wayfinding', label: 'Wayfinding' },
]

/** Build a placeable world object from a catalog entry (no id). */
export function propFromCatalog(
  catalogId: string,
  position: [number, number, number],
  rotationY = 0,
): Omit<WorldObject, 'id'> | null {
  const entry = getEventCatalogEntry(catalogId)
  if (!entry) return null
  return {
    kind: 'prop',
    position,
    size: [...entry.size],
    rotationY,
    color: entry.color,
    catalogId: entry.id,
    simulationRole: entry.simulationRole,
    solid: entry.blocksNavigation,
    capacity: entry.capacity,
    serviceDuration: entry.serviceDuration,
  }
}

export const SIMULATION_ROLE_LABELS: Record<SimulationRole, string> = {
  decoration: 'Decoration',
  obstacle: 'Obstacle',
  entrance: 'Entrance',
  exit: 'Exit',
  registration: 'Registration',
  booth: 'Booth',
  service: 'Service',
  seating: 'Seating',
  queue: 'Queue',
  stage: 'Stage',
  pickup: 'Pickup',
  delivery: 'Delivery',
}
