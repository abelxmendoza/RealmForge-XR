import type { AnchorName, Direction, SpawnSpec } from '../world/spawn'
import type { VoiceCommand } from './types'

/**
 * Grammar for object commands (deterministic, no LLM):
 *
 *   add / create / place / put / spawn / generate / build / make / give me
 *     [count] [size] [style/material] <object> [near the robot | by the goal | in the center | here]
 *     [N metres north/south/east/west/left/right/forward/back of …]
 *   move it|them [N metres] <direction>        move it to the goal / robot / center
 *   rotate|turn it|them [N degrees] [left|right] (default 90°)
 *   make it|them bigger / smaller / taller / shorter / twice as big / half the size
 *   duplicate it [N times] / make N copies / N more
 *
 * "it" = the selected object (else the last thing made); "them" = everything made by the last command.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, several: 4, some: 3, many: 8, lots: 10, bunch: 5,
}
// AssemblyAI often hears "to"/"too" for two and "for" for four right before a noun.
const SOUND_ALIKES: Record<string, number> = { to: 2, too: 2, for: 4, won: 1 }

/** First count in the phrase: digits or number words. */
export function parseCount(t: string, fallback = 1): number {
  const digits = /\b(\d{1,3})\b(?!\s*(?:m|meters?|metres?|units?|degrees?|deg|times|x)\b)/.exec(t)
  if (digits) return Number(digits[1])
  const words = t.split(' ')
  // "a dozen" / "a couple of": prefer the real number over the article.
  for (const w of words) if (w in NUMBER_WORDS && w !== 'a' && w !== 'an') return NUMBER_WORDS[w]
  return words.some((w) => w === 'a' || w === 'an') ? 1 : fallback
}

/** "3 meters", "five metres", "10 m", "ten units" → metres. */
function parseDistance(t: string): number | undefined {
  const digits = /\b(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|units?|blocks?|steps?)\b/.exec(t)
  if (digits) return Number(digits[1])
  const words = /\b([a-z]+)\s+(?:meters?|metres?|units?|blocks?|steps?)\b/.exec(t)
  return words ? (NUMBER_WORDS[words[1]] ?? SOUND_ALIKES[words[1]]) : undefined
}

function parseDegrees(t: string): number | undefined {
  const m = /\b(\d+|[a-z-]+)\s+(?:degrees?|deg)\b/.exec(t) ?? /\b(\d+)(?:degrees?|deg)\b/.exec(t)
  if (!m) return /\b(half way|halfway|around|180)\b/.test(t) ? 180 : undefined
  const n = Number(m[1])
  if (Number.isFinite(n)) return n
  const words: Record<string, number> = { fifteen: 15, thirty: 30, fortyfive: 45, 'forty-five': 45, sixty: 60, ninety: 90, hundred: 180 }
  return words[m[1]] ?? (m[1] === 'forty' ? 45 : undefined)
}

function parseDirection(t: string): Direction | undefined {
  if (/\b(north|forward|forwards|ahead|away|back(?:ward)?s? from me)\b/.test(t)) return 'north'
  if (/\b(south|backward|backwards|back|toward me|towards me|closer)\b/.test(t)) return 'south'
  if (/\b(east|right)\b/.test(t)) return 'east'
  if (/\b(west|left)\b/.test(t)) return 'west'
  return undefined
}

function parseAnchor(t: string): AnchorName | undefined {
  if (/\b(robot|bot)\b/.test(t)) return 'robot'
  if (/\b(goal|destination|flag|target)\b/.test(t)) return 'goal'
  if (/\b(center|centre|middle)\b/.test(t)) return 'center'
  if (/\b(here|there|it|selected|selection|that)\b/.test(t)) return 'selected'
  return undefined
}

type Entry = { words: RegExp; spec: SpawnSpec; label: string }

/** Object vocabulary, most specific first. */
const OBJECTS: Entry[] = [
  // Catalog equipment and destinations
  { words: /\b(storage )?racks?\b|\bshel(f|ves|ving)\b/, spec: { kind: 'building', assetId: 'storage-rack' }, label: 'storage rack' },
  { words: /\bwork ?stations?\b|\bwork ?benche?s?\b/, spec: { kind: 'building', assetId: 'workstation' }, label: 'workstation' },
  { words: /\bconveyors?( belts?)?\b/, spec: { kind: 'platform', assetId: 'conveyor' }, label: 'conveyor' },
  { words: /\b(cargo|shipping) containers?\b|\bcontainers?\b/, spec: { kind: 'crate', assetId: 'cargo' }, label: 'cargo container' },
  { words: /\b(safety )?barriers?\b|\bbarricades?\b/, spec: { kind: 'wall', assetId: 'barrier' }, label: 'safety barrier' },
  { words: /\bloading (bays?|docks?)\b/, spec: { kind: 'platform', assetId: 'loading-bay' }, label: 'loading bay' },
  { words: /\bpick ?up (zones?|points?|spots?)\b/, spec: { kind: 'platform', assetId: 'pickup-zone' }, label: 'pickup zone' },
  { words: /\bdelivery (zones?|points?|spots?)\b|\bdrop ?off (zones?|points?)\b/, spec: { kind: 'platform', assetId: 'delivery-zone' }, label: 'delivery zone' },
  { words: /\bcharging (pads?|stations?)\b|\bchargers?\b/, spec: { kind: 'platform', assetId: 'charging-pad' }, label: 'charging pad' },
  { words: /\binspection (points?|zones?)\b|\bcheckpoints?\b/, spec: { kind: 'platform', assetId: 'inspection-point' }, label: 'inspection point' },
  // Buildings
  { words: /\b(glass )?towers?\b|\bskyscrapers?\b|\bhigh ?rises?\b/, spec: { kind: 'building', style: 'tower' }, label: 'tower' },
  { words: /\boffices?( blocks?| buildings?)?\b/, spec: { kind: 'building', style: 'office' }, label: 'office block' },
  { words: /\bhouses?\b|\bhomes?\b|\bcottages?\b|\bcabins?\b/, spec: { kind: 'building', style: 'house' }, label: 'house' },
  { words: /\bfactor(y|ies)\b|\bindustrial( buildings?)?\b|\bwarehouses?\b|\bhangars?\b|\bsheds?\b/, spec: { kind: 'building', style: 'industrial' }, label: 'industrial building' },
  { words: /\bbuildings?\b/, spec: { kind: 'building', style: 'office' }, label: 'building' },
  // Decorations
  { words: /\bpine( trees?)?s?\b|\bfirs?\b|\bspruces?\b|\bevergreens?\b/, spec: { kind: 'tree', style: 'pine' }, label: 'pine tree' },
  { words: /\btrees?\b|\bbush(es)?\b|\boaks?\b/, spec: { kind: 'tree', style: 'round' }, label: 'tree' },
  { words: /\bstreet ?lights?\b|\blamp ?posts?\b|\blamps?\b|\blights?\b|\bstreet ?lamps?\b/, spec: { kind: 'streetlight' }, label: 'streetlight' },
  { words: /\b(metal|steel) (crates?|boxe?s?)\b/, spec: { kind: 'crate', material: 'metal' }, label: 'metal crate' },
  { words: /\bcrates?\b|\bboxe?s?\b|\bobstacles?\b/, spec: { kind: 'crate', material: 'wood' }, label: 'crate' },
  // Walls and surfaces
  { words: /\bwalls?\b|\bfences?\b/, spec: { kind: 'wall' }, label: 'wall' },
  { words: /\broads?\b|\bstreets?\b/, spec: { kind: 'platform', material: 'asphalt' }, label: 'road' },
  { words: /\bparks?\b|\blawns?\b|\bgrass( patch(es)?)?\b|\bgardens?\b/, spec: { kind: 'platform', material: 'grass' }, label: 'park' },
  { words: /\bplatforms?\b|\bplazas?\b|\bpads?\b|\bdecks?\b/, spec: { kind: 'platform' }, label: 'platform' },
]

const WALL_MATERIAL = /\b(brick|glass|wood(?:en)?|metal|steel|concrete|stone)\b/

function findObject(t: string): (Entry & { spec: SpawnSpec }) | null {
  for (const e of OBJECTS) {
    if (!e.words.test(t)) continue
    const spec: SpawnSpec = { ...e.spec }
    if (spec.kind === 'wall' && !spec.assetId) {
      const m = WALL_MATERIAL.exec(t)?.[1]
      if (m) spec.material = m.startsWith('wood') ? 'wood' : m === 'steel' ? 'metal' : m === 'stone' ? 'concrete' : (m as SpawnSpec['material'])
    }
    if (/\b(huge|giant|massive|enormous)\b/.test(t)) spec.scale = 2
    else if (/\b(big|large)\b/.test(t)) spec.scale = 1.5
    else if (/\b(tiny|mini)\b/.test(t)) spec.scale = 0.5
    else if (/\b(small|little)\b/.test(t)) spec.scale = 0.7
    if (/\btall\b/.test(t)) spec.heightScale = 1.6
    else if (/\b(short|low)\b/.test(t)) spec.heightScale = 0.6
    return { ...e, spec }
  }
  return null
}

const SPAWN_VERB = /^(?:(?:please|can you|could you|i want|i'd like|let's|lets)\s+)*(add|create|place|put|spawn|generate|build|make|give me|drop|plant|set up|i need|we need)\b/
const THEM = /\b(them|those|these|they|all of them|the group|everything you made)\b/

/** Parse object commands. Returns null when the phrase isn't about objects. */
export function parseObjectCommand(t: string): VoiceCommand | null {
  const which = THEM.test(t) ? 'last' : 'selected'

  // Duplicate: "duplicate it 3 times", "make 4 copies", "copy that", "5 more"
  const moreOfSame = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) more\b/.test(t) && !findObject(t)
  if (/\b(duplicate|copy|clone|copies)\b/.test(t) || moreOfSame) {
    const times = /\b(\d+|[a-z]+) (?:times|copies|more|clones)\b/.exec(t)
    const count = times ? (Number(times[1]) || NUMBER_WORDS[times[1]] || 1) : 1
    return { type: 'DUPLICATE_OBJECTS', which, count: Math.min(25, count) }
  }

  // Move: "move it 10 meters north", "move them left", "move it to the goal"
  if (/^(?:please\s+)?(move|shift|slide|push|bring|drag)\b/.test(t)) {
    const to = /\bto (the )?(robot|bot|goal|destination|flag|center|centre|middle)\b/.exec(t)
    if (to) return { type: 'MOVE_OBJECTS', which, to: parseAnchor(to[0]) as Exclude<AnchorName, 'auto' | 'selected'> }
    const direction = parseDirection(t)
    if (!direction) return null
    return { type: 'MOVE_OBJECTS', which, direction, distance: parseDistance(t) }
  }

  // Rotate: "rotate it 45 degrees", "turn them left", "spin it around"
  if (/^(?:please\s+)?(rotate|turn|spin)\b/.test(t)) {
    let deg = parseDegrees(t) ?? 90
    if (/\b(right|clockwise)\b/.test(t) && !/\bcounter ?clockwise\b/.test(t)) deg = -Math.abs(deg)
    return { type: 'ROTATE_OBJECTS', which, degrees: deg }
  }

  // Resize: "make it bigger", "make them twice as big", "make it taller"
  const resize = /\b(bigger|larger|smaller|tinier|taller|higher|shorter|lower|twice as (big|large|tall)|double (the )?size|half (the )?size|wider|narrower|grow|shrink|scale (it|them) up|scale (it|them) down)\b/.exec(t)
  if (resize && /^(?:please\s+)?(make|scale|grow|shrink|resize)\b/.test(t)) {
    const w = resize[0]
    if (/taller|higher/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'height' }
    if (/shorter|lower/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'height' }
    if (/wider/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'footprint' }
    if (/narrower/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'footprint' }
    if (/twice|double/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 2, axis: 'all' }
    if (/half/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 0.5, axis: 'all' }
    if (/smaller|tinier|shrink|down/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'all' }
    return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'all' }
  }

  // Spawn: "add three trees near the robot", "build two glass towers 20 meters north of the goal"
  const verb = SPAWN_VERB.exec(t)
  if (!verb) return null
  const obj = findObject(t)
  if (!obj) return null
  // Skip the verb itself when counting ("make" has no number, but "add to trees" means 2).
  const rest = t.slice(verb.index + verb[0].length).trim()
  let count = parseCount(rest, 1)
  const first = rest.split(' ')[0]
  if (count === 1 && first in SOUND_ALIKES) count = SOUND_ALIKES[first]
  const near = /\b(near|next to|by|beside|around|at|in front of|in|behind|close to|of)\b/.exec(rest)
  const anchor = near ? parseAnchor(rest.slice(near.index)) : /\bhere\b/.test(rest) ? 'selected' : undefined
  const direction = parseDirection(rest)
  return {
    type: 'SPAWN_OBJECTS',
    spec: obj.spec,
    label: obj.label,
    count: Math.max(1, Math.min(25, count)),
    placement: { anchor: anchor ?? 'auto', direction, distance: direction ? parseDistance(rest) : undefined },
  }
}
