export const LANDING_WORLDS = [
  { id: 'forge-district', name: 'Forge District', number: '01', category: 'URBAN WORLDBUILDING', description: 'A city block with room for your next big idea. Shape buildings, roads, and the spaces in between.', color: '#ff8854', label: 'City / infrastructure' },
  { id: 'mars-outpost', name: 'Mars Outpost', number: '02', category: 'OFF-WORLD EXPLORATION', description: 'Build a foothold on a new frontier. Arrange habitats, research facilities, and routes across red terrain.', color: '#de805c', label: 'Research / exploration' },
  { id: 'warehouse', name: 'Autonomous Warehouse', number: '03', category: 'ROBOT NAVIGATION', description: 'Lay out a working facility. Place equipment, mark destinations, and put the robot’s route to the test.', color: '#87b8b1', label: 'Logistics / simulation' },
] as const
export type LandingWorldId = typeof LANDING_WORLDS[number]['id']
export function editorHref(world?: LandingWorldId) {
  return world ? `?editor=1&world=${encodeURIComponent(world)}` : '?editor=1'
}
export function readEntry(search: string): { editor: boolean; world?: LandingWorldId } {
  const params = new URLSearchParams(search)
  const world = LANDING_WORLDS.find((item) => item.id === params.get('world'))?.id
  return { editor: params.get('editor') === '1', ...(world ? { world } : {}) }
}
