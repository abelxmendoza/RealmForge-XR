export const LANDING_WORLDS = [
  { id: 'forge-district', name: 'Forge District', number: '01', category: 'URBAN WORLDBUILDING', description: 'A city block with room for your next big idea. Shape buildings, roads, and the spaces in between.', color: '#ff8854', label: 'City / infrastructure' },
  { id: 'mars-outpost', name: 'Mars Outpost', number: '02', category: 'OFF-WORLD EXPLORATION', description: 'Build a foothold on a new frontier. Arrange habitats, research facilities, and routes across red terrain.', color: '#de805c', label: 'Research / exploration' },
  { id: 'warehouse', name: 'Autonomous Warehouse', number: '03', category: 'ROBOT NAVIGATION', description: 'Lay out a facility with equipment and destination markers. Add workers, courier robots, and vehicles to explore independent routes.', color: '#87b8b1', label: 'Logistics / simulation' },
] as const
export type LandingWorldId = typeof LANDING_WORLDS[number]['id'] | 'job-fair' | 'empty-event-venue'
export function editorHref(world?: LandingWorldId) {
  return world ? `?editor=1&world=${encodeURIComponent(world)}` : '?editor=1'
}
export function readEntry(search: string): { editor: boolean; world?: LandingWorldId } {
  const params = new URLSearchParams(search)
  const requested = params.get('world')
  const world: LandingWorldId | undefined = requested === 'job-fair' || requested === 'empty-event-venue' ? requested : LANDING_WORLDS.find((item) => item.id === requested)?.id
  return { editor: params.get('editor') === '1', ...(world ? { world } : {}) }
}
