export const LANDING_WORLDS = [
  {
    id: 'forge-district',
    name: 'Forge District',
    shortName: 'Forge',
    number: '04',
    category: 'URBAN WORLDBUILDING',
    description: 'A city block with room for your next big idea. Shape buildings, roads, and the spaces in between.',
    color: '#ff8854',
    label: 'City / infrastructure',
  },
  {
    id: 'mars-outpost',
    name: 'Mars Outpost',
    shortName: 'Mars',
    number: '05',
    category: 'OFF-WORLD EXPLORATION',
    description: 'Build a foothold on a new frontier. Arrange habitats, research facilities, and routes across red terrain.',
    color: '#de805c',
    label: 'Research / exploration',
  },
  {
    id: 'warehouse',
    name: 'Autonomous Warehouse',
    shortName: 'Warehouse',
    number: '06',
    category: 'ROBOT NAVIGATION',
    description: 'Lay out a working facility. Place equipment, mark destinations, and put the robot’s route to the test.',
    color: '#87b8b1',
    label: 'Logistics / simulation',
  },
  {
    id: 'factory-floor',
    name: 'Factory Floor',
    shortName: 'Factory',
    number: '07',
    category: 'MANUFACTURING LAYOUT',
    description: 'Plan a production hall: machines, an assembly line, robot cells and AGV lanes. Check how people and parts move.',
    color: '#d6b25e',
    label: 'Manufacturing / traffic',
  },
] as const

/** Event venue templates — empty shell or a ready job-fair layout. */
export const LANDING_VENUES = [
  {
    id: 'empty-event-venue',
    name: 'Empty Space',
    shortName: 'Empty Space',
    number: '01',
    category: 'EVENT DESIGN',
    description: 'A completely empty board with no objects, actors, robot or destination. Build your own scene from scratch.',
    color: '#c4a574',
    label: 'Empty board / design',
  },
  {
    id: 'job-fair',
    name: 'Job Fair',
    shortName: 'Job Fair',
    number: '02',
    category: 'EVENT SIMULATION',
    description: 'Registration, employer booths, seating, and a stage — all editable catalog props. Start the attendee and watch the flow.',
    color: '#e07845',
    label: 'Job fair / attendee flow',
  },
  {
    id: 'music-festival',
    name: 'Music Festival',
    shortName: 'Festival',
    number: '03',
    category: 'CONCERTS & FESTIVALS',
    description: 'An open-air concert site with security gates, a main stage, food stalls, bars and exits. Watch the crowd flow.',
    color: '#b197fc',
    label: 'Festival / crowd flow',
  },
] as const

/** Hero picker order: Empty Space first, then Job Fair, then world templates. */
export const LANDING_TEMPLATES = [...LANDING_VENUES, ...LANDING_WORLDS] as const
export type LandingWorldId = (typeof LANDING_TEMPLATES)[number]['id']

export function editorHref(world?: LandingWorldId) {
  return world ? `?editor=1&world=${encodeURIComponent(world)}` : '?editor=1'
}

export function readEntry(search: string): { editor: boolean; world?: LandingWorldId } {
  const params = new URLSearchParams(search)
  const world = LANDING_TEMPLATES.find((item) => item.id === params.get('world'))?.id
  return { editor: params.get('editor') === '1', ...(world ? { world } : {}) }
}
