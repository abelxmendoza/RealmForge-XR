/**
 * Shared desktop / XR toolbar information architecture.
 * Friendly labels and shortcut hints only — actions live in callers.
 */
import type { Tool } from '../world/store'
import type { ScaleId } from '../scene/worldRoot'

export type ToolbarSection = 'build' | 'edit' | 'plan' | 'simulate' | 'view' | 'save'

export const TOOLBAR_SECTIONS: { id: ToolbarSection; label: string; hint: string }[] = [
  { id: 'build', label: 'Build', hint: 'Place walls, buildings, and objects' },
  { id: 'edit', label: 'Edit', hint: 'Move, rotate, resize, or remove selection' },
  { id: 'plan', label: 'Plan Routes', hint: 'Set destinations and test path blocking' },
  { id: 'simulate', label: 'Simulate', hint: 'Run the event attendee walkthrough' },
  { id: 'view', label: 'View', hint: 'Scale, floor, and XR display options' },
  { id: 'save', label: 'Save', hint: 'Save, load, import, and export worlds' },
]

/** Placement / selection tools with keyboard digits (1–0). Shortcuts stay in tooltips only. */
export const TOOLBAR_TOOLS: { id: Tool; label: string; key: string; section: ToolbarSection; tooltip: string }[] = [
  { id: 'select', label: 'Move', key: '1', section: 'edit', tooltip: 'Select and move objects (1)' },
  { id: 'wall', label: 'Wall', key: '2', section: 'build', tooltip: 'Draw a wall on the ground (2)' },
  { id: 'building', label: 'Building', key: '3', section: 'build', tooltip: 'Place a building (3)' },
  { id: 'goal', label: 'Set Destination', key: '4', section: 'plan', tooltip: 'Click the ground to set the robot goal (4)' },
  { id: 'robot', label: 'Place Robot', key: '5', section: 'plan', tooltip: 'Click to place the robot start (5)' },
  { id: 'platform', label: 'Road / Platform', key: '6', section: 'build', tooltip: 'Place a walkable platform or road (6)' },
  { id: 'decor', label: 'Decoration', key: '7', section: 'build', tooltip: 'Place trees, lights, or crates (7)' },
  { id: 'asset', label: 'Catalog Object', key: '8', section: 'build', tooltip: 'Place an object from the catalog (8)' },
  { id: 'actor', label: 'Actor', key: '9', section: 'build', tooltip: 'Place a walking actor (9)' },
  { id: 'event', label: 'Event Object', key: '0', section: 'build', tooltip: 'Place an event-venue object (0)' },
]

export const SCALE_LABELS: Record<ScaleId, string> = {
  tabletop: 'Miniature View (1:60)',
  room: 'Room View (1:20)',
  large: 'Large View (1:4)',
  life: 'Life Size (1:1)',
}

export const SCALE_SHORT: Record<ScaleId, string> = {
  tabletop: 'Mini',
  room: 'Room',
  large: 'Large',
  life: 'Life',
}

/** Prefer shared tool list so keyboard shortcuts stay in sync with the HUD. */
export function toolByKey(key: string) {
  return TOOLBAR_TOOLS.find((t) => t.key === key)
}
