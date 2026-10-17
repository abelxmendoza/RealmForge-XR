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
      '1. Enter AR or VR from the top bar.',
      '2. Place World (AR) pins the map on a table.',
      '3. Desktop: use Build / Edit / Plan / View / Save.',
      '4. Left palm toward you opens the wrist View menu.',
      '5. The floating panel has Tools, Worlds, Help.',
      '6. Grab buildings with pinch or grip.',
      '7. Send the robot with Set Destination.',
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
      'Turn your LEFT palm toward your face.',
      'Poke buttons with your RIGHT fingertip.',
      'Rays — pointer beams on / off.',
      'Grid — align to map grid on / off.',
      'Your Floor / Virtual — passthrough vs solid.',
      '1:60 → 1:1 — miniature to life size.',
      'Recenter — world back in front of you.',
      'Help — opens this guide panel in XR.',
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
    ],
  },
  {
    id: 'voice',
    title: 'Voice commands',
    tab: 'Voice',
    lines: [
      'Tap the mic (web: bottom · VR: top of panel),',
      'speak, tap again. Web: or hold Space to talk.',
      '"Add three trees near the robot"',
      '"Build two tall towers 20 m north of the goal"',
      '"Move them 10 meters left" · "move it to the goal"',
      '"Rotate it 45 degrees" · "make it taller"',
      '"Duplicate it 3 times" · "undo" · "save world"',
      '"Load Mars outpost" · "set destination"',
      '"it" = selection · "them" = what you just added.',
    ],
  },
  {
    id: 'desktop',
    title: 'Desktop shortcuts',
    tab: 'Keys',
    lines: [
      '1–0 tools · B block path · G align to grid.',
      'X pointer rays · V floor mode · R rotate 15°.',
      '[ ] height · D duplicate · M style · T roof.',
      'Del delete · Esc deselect · ? open Guide.',
      'Ctrl+S save · Ctrl+Z / Shift+Z undo redo.',
      'Sections: Build, Edit, Plan, Simulate, View, Save.',
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
