import type { Tool } from '../world/store'

/** Primary HUD navigation — only one section’s controls are visible at a time. */
export type HudSectionId = 'build' | 'edit' | 'plan' | 'simulate' | 'view' | 'save'

export const HUD_SECTIONS: { id: HudSectionId; label: string; hint: string }[] = [
  { id: 'build', label: 'Build', hint: 'Place walls, buildings, and objects' },
  { id: 'edit', label: 'Edit', hint: 'Select, change, duplicate, or remove' },
  { id: 'plan', label: 'Plan Routes', hint: 'Robot start, destination, and path demos' },
  { id: 'simulate', label: 'Simulate', hint: 'Run the event attendee preview' },
  { id: 'view', label: 'View', hint: 'Scale, floor, and XR display options' },
  { id: 'save', label: 'Save', hint: 'Save, load, import, and export worlds' },
]

/**
 * Placement / selection tools. Labels are user-facing; shortcut keys stay in tooltips only.
 * Keys match useKeyboard in App.tsx — do not change key bindings without updating that handler.
 */
export const EDITOR_TOOLS: { id: Tool; label: string; key: string; tooltip: string; section: HudSectionId }[] = [
  { id: 'select', label: 'Select & Move', key: '1', tooltip: 'Click an object to select it, then drag to move. Shortcut 1', section: 'edit' },
  { id: 'wall', label: 'Draw Wall', key: '2', tooltip: 'Click and drag on the ground to draw a wall. Shortcut 2', section: 'build' },
  { id: 'building', label: 'Place Building', key: '3', tooltip: 'Click the ground to place a building. Shortcut 3', section: 'build' },
  { id: 'goal', label: 'Set Destination', key: '4', tooltip: 'Click the ground to set where the robot (or selected actor) should go. Shortcut 4', section: 'plan' },
  { id: 'robot', label: 'Place Robot', key: '5', tooltip: 'Click the ground to place the robot start. Shortcut 5', section: 'plan' },
  { id: 'platform', label: 'Place Road', key: '6', tooltip: 'Click and drag to draw a road or platform. Shortcut 6', section: 'build' },
  { id: 'decor', label: 'Place Decoration', key: '7', tooltip: 'Click to place a tree, streetlight, or crate. Shortcut 7', section: 'build' },
  { id: 'asset', label: 'Place Catalog Item', key: '8', tooltip: 'Place the selected warehouse / catalog object. Shortcut 8', section: 'build' },
  { id: 'actor', label: 'Place Actor', key: '9', tooltip: 'Place a worker, courier, or vehicle. Shortcut 9', section: 'build' },
  { id: 'event', label: 'Place Event Object', key: '0', tooltip: 'Place furniture or booths from the event catalog. Shortcut 0', section: 'build' },
]

export const BUILD_TOOLS = EDITOR_TOOLS.filter((t) => t.section === 'build')
export const PLAN_TOOLS = EDITOR_TOOLS.filter((t) => t.section === 'plan')
export const EDIT_TOOLS = EDITOR_TOOLS.filter((t) => t.section === 'edit')

/** Friendly copy for world scale presets (ratios unchanged). */
export const SCALE_LABELS: Record<string, { label: string; short: string; tooltip: string }> = {
  tabletop: {
    label: 'Miniature View (1:60)',
    short: '1:60',
    tooltip: 'Small map on a table — about 1.3 m across',
  },
  room: {
    label: 'Room View (1:20)',
    short: '1:20',
    tooltip: 'Map spans roughly a room (~4 m)',
  },
  large: {
    label: 'Large View (1:4)',
    short: '1:4',
    tooltip: 'Walk among knee-high buildings (~20 m)',
  },
  life: {
    label: 'Life Size (1:1)',
    short: '1:1',
    tooltip: 'One map metre equals one real metre',
  },
}
