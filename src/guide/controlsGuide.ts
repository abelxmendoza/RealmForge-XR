/**
 * Shared user & controls guide — one content source for desktop HTML and immersive XR.
 * Keep lines short for VR readability (≈40 chars / line when rendered on tiles).
 */

export type GuideSectionId =
  | 'start'
  | 'hands'
  | 'wrist'
  | 'panel'
  | 'tools'
  | 'scans'
  | 'voice'
  | 'desktop'
  | 'comfort'

export interface GuideSection {
  id: GuideSectionId
  title: string
  /** Short label for tabs / buttons */
  tab: string
  lines: string[]
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Quick start',
    tab: 'Start',
    lines: [
      '1. Enter XR from the top bar (AR preferred).',
      '2. Place world (AR) pins the map on a table.',
      '3. Left palm toward you opens the wrist menu.',
      '4. The floating panel has Tools, Worlds, Guide.',
      '5. Grab buildings with pinch or grip.',
      '6. Send the robot with Set destination.',
    ],
  },
  {
    id: 'hands',
    title: 'Hands & grab',
    tab: 'Hands',
    lines: [
      'Pinch or squeeze grip on a building to grab.',
      'Move your hand — it stays on the ground.',
      'Twist to rotate. Snap (G) steps 15°.',
      'Two hands on one object: pull apart to scale.',
      'One hand never changes size.',
      'Grab the dark table edge to move the whole map.',
      'Two hands on the edge turn the map (level).',
    ],
  },
  {
    id: 'wrist',
    title: 'Wrist menu',
    tab: 'Wrist',
    lines: [
      'Hands: turn your LEFT palm toward your face.',
      'Controllers: press Y to pin it (Y again hides).',
      'Poke with your RIGHT fingertip, or point a ray.',
      'Menu — bring the panel to you, or close it.',
      'Hide all · ‹ Back · Home · Exit VR — always here.',
      'Tabletop — edit the miniature overview.',
      'Enter world — edit inside at life size.',
      'Enter near a selection, else the robot start.',
      'Both views edit the same saved world.',
      'Rays — rays also edit the world (menus always).',
      'Snap · Occl. · Surf. — grid, occlusion, surfaces.',
    ],
  },
  {
    id: 'panel',
    title: 'Control panel',
    tab: 'Panel',
    lines: [
      'Floats ahead-left when you enter XR.',
      'Point + trigger / pinch to press tiles.',
      'Tools — build, walls, robot, destination.',
      'Worlds — Forge, Mars, Warehouse, saves.',
      'Edit / Brush — reshape the selection.',
      'Assets / Routes — catalog + robot goals.',
      'Hide / Show — header tile. Recenter panel',
      'puts it in front of you again.',
    ],
  },
  {
    id: 'tools',
    title: 'Building tools',
    tab: 'Tools',
    lines: [
      'Select — move objects (desktop drag / XR grab).',
      'Wall — press, drag, release to draw.',
      'Building / Decor — click or aim at ground.',
      'Platform — drag a road or pad.',
      'Place robot / Set destination — pathfinding.',
      'Yellow handle resize · blue rotate.',
      'Green duplicate · purple style · red delete.',
      'Holding it with a controller? Press B / Y to delete.',
    ],
  },
  {
    id: 'scans',
    title: 'Scan a real space (Scaniverse)',
    tab: 'Scans',
    lines: [
      '1. Install Scaniverse (free, iPhone or Android).',
      '2. One room at a time; overlap a shared doorway.',
      '3. Classic: choose Mesh, then',
      '   Share → Export Model → GLB.',
      '   New: make a Mesh asset in a Site, then',
      '   download its GLB from Scaniverse Web.',
      '4. Send the .glb to this device (AirDrop, Drive…).',
      '5. Web: Build → Property scans → Add scans (.glb).',
      '   Headset: Property scans → Files (exit XR).',
      '6. Line rooms up, then Measure scale.',
    ],
  },
  {
    id: 'voice',
    title: 'Voice commands',
    tab: 'Voice',
    lines: [
      'Tap the mic (web: bottom · VR: top of panel)',
      'and speak. It runs when you pause. Web: hold Space.',
      '"Add three trees near the robot"',
      '"Build two tall towers 20 m north of the goal"',
      '"Move them 10 meters left" · "move it to the goal"',
      '"Rotate it 45 degrees" · "make it taller"',
      '"Duplicate it 3 times" · "undo" · "save world"',
      '"Delete it" · "remove that" · "get rid of them"',
      '"New Mars world" · "open my world 2" · "resume"',
      '"Go back" · "hide the menu" · "show the menu"',
      '"Add a waypoint at the goal" · "start the route"',
      '"Exit VR" · "go home" ("go home now" skips confirm)',
      '"it" = selection · "them" = what you just added.',
    ],
  },
  {
    id: 'desktop',
    title: 'Desktop shortcuts',
    tab: 'Keys',
    lines: [
      '1–8 tools · B block route · G snap.',
      'X rays · V surface · R rotate 15°.',
      '[ ] height · D duplicate · M style · T roof.',
      'Del delete · Esc deselect.',
      'Ctrl+S save · Ctrl+Z / Shift+Z undo redo.',
      'Drag empty ground to orbit the view.',
      'Drop a .json world file to import.',
    ],
  },
  {
    id: 'comfort',
    title: 'Comfort & tips',
    tab: 'Tips',
    lines: [
      'Stand or sit with clear floor space.',
      'Start at 1:60 tabletop, then scale up.',
      'If pointing feels hard, turn Rays on.',
      'Take breaks; recenter if the panel drifts.',
      'Well-lit room = better hand tracking.',
      'Confirm dialogs must be answered before',
      'you can hide the control panel.',
    ],
  },
]

export const GUIDE_SECTION_IDS = GUIDE_SECTIONS.map((s) => s.id)

export function getGuideSection(id: GuideSectionId): GuideSection {
  return GUIDE_SECTIONS.find((s) => s.id === id) ?? GUIDE_SECTIONS[0]!
}

export function nextGuideSection(id: GuideSectionId): GuideSectionId {
  const i = GUIDE_SECTION_IDS.indexOf(id)
  return GUIDE_SECTION_IDS[(i + 1) % GUIDE_SECTION_IDS.length]!
}

export function prevGuideSection(id: GuideSectionId): GuideSectionId {
  const i = GUIDE_SECTION_IDS.indexOf(id)
  return GUIDE_SECTION_IDS[(i - 1 + GUIDE_SECTION_IDS.length) % GUIDE_SECTION_IDS.length]!
}
