export const LANDING_WORLDS = [
  {
    id: 'forge-district',
    name: 'Forge District',
    shortName: 'Forge',
    number: '01',
    category: 'URBAN WORLDBUILDING',
    description: 'A city block with room for your next big idea. Shape buildings, roads, and the spaces in between.',
    color: '#ff8854',
    label: 'City / infrastructure',
  },
  {
    id: 'mars-outpost',
    name: 'Mars Outpost',
    shortName: 'Mars',
    number: '02',
    category: 'OFF-WORLD EXPLORATION',
    description: 'Build a foothold on a new frontier. Arrange habitats, research facilities, and routes across red terrain.',
    color: '#de805c',
    label: 'Research / exploration',
  },
  {
    id: 'warehouse',
    name: 'Autonomous Warehouse',
    shortName: 'Warehouse',
    number: '03',
    category: 'ROBOT NAVIGATION',
    description: 'Lay out a working facility. Place equipment, mark destinations, and put the robot’s route to the test.',
    color: '#87b8b1',
    label: 'Logistics / simulation',
  },
] as const

/** Event venue templates — empty shell or a ready job-fair layout. */
export const LANDING_VENUES = [
  {
    id: 'empty-event-venue',
    name: 'Empty',
    shortName: 'Empty',
    number: '04',
    category: 'EVENT DESIGN',
    description: 'A completely empty board with no objects, actors, robot or destination. Build your own scene from scratch.',
    color: '#c4a574',
    label: 'Empty board / design',
  },
  {
    id: 'job-fair',
    name: 'Job Fair',
    shortName: 'Job Fair',
    number: '05',
    category: 'EVENT SIMULATION',
    description: 'Registration, employer booths, seating, and a stage — all editable catalog props. Start the attendee and watch the flow.',
    color: '#e07845',
    label: 'Job fair / attendee flow',
  },
] as const

export const LANDING_TEMPLATES = [...LANDING_WORLDS, ...LANDING_VENUES] as const
export type LandingWorldId = (typeof LANDING_TEMPLATES)[number]['id']

export function editorHref(world?: LandingWorldId) {
  return world ? `?editor=1&world=${encodeURIComponent(world)}` : '?editor=1'
}

export function readEntry(search: string): { editor: boolean; world?: LandingWorldId } {
  const params = new URLSearchParams(search)
  const world = LANDING_TEMPLATES.find((item) => item.id === params.get('world'))?.id
  return { editor: params.get('editor') === '1', ...(world ? { world } : {}) }
}
