import type { Tool } from '../world/store'
import type { ToolbarSection } from './toolbar'

/** Tools whose panel is the catalog you pick from; choosing one must show it even with an object still selected. */
export const CATALOG_TOOLS: readonly Tool[] = ['actor', 'asset', 'event']

/** Which right-panel context is active — single source for routing + tests. */
export function resolveInspectorContext(opts: {
  section: ToolbarSection
  tool: Tool
  hasObject: boolean
  hasActor: boolean
}): string {
  if (opts.section === 'simulate' || opts.section === 'save') return opts.section
  if (CATALOG_TOOLS.includes(opts.tool)) return opts.tool
  if (opts.hasObject) return 'object'
  if (opts.hasActor) return 'actor'
  return opts.tool
}

export const TOOL_PANEL_HEADINGS: Partial<Record<Tool, string>> = {
  select: 'Select',
  wall: 'Draw wall',
  building: 'Place building',
  goal: 'Set destination',
  route: 'Flow route',
  robot: 'Place robot',
  platform: 'Place road',
  decor: 'Place decoration',
  asset: 'Object catalog',
  actor: 'Place actor',
  event: 'Event catalog',
}
