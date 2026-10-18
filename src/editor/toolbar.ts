/**
 * Shared desktop / XR toolbar information architecture.
 * Friendly labels and shortcut hints only — actions live in callers.
 */
import type { Tool } from '../world/store'
import type { ScaleId } from '../scene/worldRoot'

export type ToolbarSection = 'build' | 'edit' | 'plan' | 'simulate' | 'view' | 'save'

export const TOOLBAR_SECTIONS: { id: ToolbarSection; label: string; hint: string }[] = [
  { id: 'build', label: 'Build', hint: 'Place walls, buildings, and objects' },
  { id: 'edit', label: 'Edit', hint: 'Select an object, then move, rotate, resize, or remove it' },
  { id: 'plan', label: 'Plan Routes', hint: 'Set destinations and test path blocking' },
  { id: 'simulate', label: 'Simulate', hint: 'Run the event attendee walkthrough' },
  { id: 'view', label: 'View', hint: 'Scale, floor, and XR display options' },
  { id: 'save', label: 'Save', hint: 'Save, load, import, and export worlds' },
]

/** Placement / selection tools with keyboard digits (1–0). Shortcuts stay in tooltips only. */
export const TOOLBAR_TOOLS: { id: Tool; label: string; key: string; section: ToolbarSection; tooltip: string }[] = [
  { id: 'select', label: 'Select', key: '1', section: 'edit', tooltip: 'Select objects (1). Drag a selected object to move it.' },
  { id: 'wall', label: 'Wall', key: '2', section: 'build', tooltip: 'Drag on empty ground to draw a wall (2). Stays on so you can draw several; press Done placing or 1 to stop.' },
  { id: 'building', label: 'Building', key: '3', section: 'build', tooltip: 'Click empty ground to place a building (3). Stays on so you can place several.' },
  { id: 'goal', label: 'Add Waypoint', key: '4', section: 'plan', tooltip: 'Click empty ground to add a route stop (4). Add several, then Play.' },
  {
    id: 'route',
    label: 'Flow Route',
    key: 'f',
    section: 'plan',
    tooltip: 'RealmForge Flow: click ground to draft planned waypoints (F). Finish in the right panel.',
  },
  { id: 'robot', label: 'Place Robot', key: '5', section: 'plan', tooltip: 'Click empty ground to place the robot (5), then returns to Select.' },
  { id: 'platform', label: 'Road / Platform', key: '6', section: 'build', tooltip: 'Drag on empty ground to lay a road or platform (6). Stays on so you can lay several.' },
  { id: 'decor', label: 'Decoration', key: '7', section: 'build', tooltip: 'Click empty ground to place a decoration (7). Stays on so you can place several.' },
  { id: 'asset', label: 'Catalog Object', key: '8', section: 'build', tooltip: 'Click empty ground to place a catalog object (8). Stays on so you can place several.' },
  { id: 'actor', label: 'Actor', key: '9', section: 'build', tooltip: 'Place one actor on empty ground (9), then returns to Select.' },
  { id: 'event', label: 'Event Object', key: '0', section: 'build', tooltip: 'Click empty ground to place an event object (0). Stays on so you can place several.' },
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
