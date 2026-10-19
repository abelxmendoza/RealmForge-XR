import type { AnchorName, Direction, SpawnSpec } from '../world/spawn'
import type { Target } from '../world/targets'
import type { ActorKind } from '../actors/types'
import type { MaterialId, RoofType } from '../world/types'
import { BUILDING_FINISH } from '../world/edit'

/**
 * Words the voice grammar knows: numbers, distances, directions, places, every object and actor
 * noun, looks (materials, colours, roofs), and spoken references to things ("the houses").
 * Deterministic and pure: no world access.
 */

export const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, several: 4, some: 3, many: 8, lots: 10, bunch: 5,
}
// AssemblyAI often hears "to"/"too" for two and "for" for four right before a noun.
export const SOUND_ALIKES: Record<string, number> = { to: 2, too: 2, for: 4, won: 1 }

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
export function parseDistance(t: string): number | undefined {
  const digits = /\b(\d+(?:\.\d+)?)\s*(?:m|meters?|metres?|units?|blocks?|steps?)\b/.exec(t)
  if (digits) return Number(digits[1])
  const words = /\b([a-z]+)\s+(?:meters?|metres?|units?|blocks?|steps?)\b/.exec(t)
  return words ? (NUMBER_WORDS[words[1]] ?? SOUND_ALIKES[words[1]]) : undefined
}

export function parseDegrees(t: string): number | undefined {
  const m = /\b(\d+|[a-z-]+)\s+(?:degrees?|deg)\b/.exec(t) ?? /\b(\d+)(?:degrees?|deg)\b/.exec(t)
  if (!m) return /\b(half way|halfway|around|180)\b/.test(t) ? 180 : undefined
  const n = Number(m[1])
  if (Number.isFinite(n)) return n
  const words: Record<string, number> = { fifteen: 15, thirty: 30, fortyfive: 45, 'forty-five': 45, sixty: 60, ninety: 90, hundred: 180 }
  return words[m[1]] ?? (m[1] === 'forty' ? 45 : undefined)
}

export function parseDirection(t: string): Direction | undefined {
  if (/\b(north|forward|forwards|ahead|away|back(?:ward)?s? from me)\b/.test(t)) return 'north'
  if (/\b(south|backward|backwards|back|toward me|towards me|closer)\b/.test(t)) return 'south'
  if (/\b(east|right)\b/.test(t)) return 'east'
  if (/\b(west|left)\b/.test(t)) return 'west'
  return undefined
}

export function parseAnchor(t: string): AnchorName | undefined {
  if (/\b(robot|bot)\b/.test(t)) return 'robot'
  if (/\b(goal|destination|flag|target)\b/.test(t)) return 'goal'
  if (/\b(center|centre|middle)\b/.test(t)) return 'center'
  if (/\b(here|there|it|selected|selection|that)\b/.test(t)) return 'selected'
  return undefined
}

/** `generic`: the noun names a kind, not a style ("buildings", "trees"), so as a target it matches every style. */
export type Entry = { words: RegExp; spec: SpawnSpec; label: string; generic?: boolean }

/** Object vocabulary, most specific first. */
export const OBJECTS: Entry[] = [
  // Event catalog props (job fair / venue)
  { words: /\b(exhibition |trade )?booths?\b|\bstalls?\b/, spec: { kind: 'prop', catalogId: 'exhibition-booth' }, label: 'exhibition booth' },
  { words: /\bregistration desks?\b|\bcheck[- ]?in desks?\b/, spec: { kind: 'prop', catalogId: 'registration-desk' }, label: 'registration desk' },
  { words: /\b(folding )?chairs?\b/, spec: { kind: 'prop', catalogId: 'chair-folding' }, label: 'folding chair' },
  { words: /\bcocktail tables?\b|\bhigh[- ]?tops?\b/, spec: { kind: 'prop', catalogId: 'cocktail-table' }, label: 'cocktail table' },
  { words: /\b(round )?tables?\b/, spec: { kind: 'prop', catalogId: 'table-rect-m' }, label: 'table' },
  { words: /\bstages?\b/, spec: { kind: 'prop', catalogId: 'stage' }, label: 'stage' },
  { words: /\bqueue barriers?\b|\bstanchions?\b/, spec: { kind: 'prop', catalogId: 'queue-barrier' }, label: 'queue barrier' },
  { words: /\b(directional )?signs?\b|\bwayfinding signs?\b/, spec: { kind: 'prop', catalogId: 'directional-sign' }, label: 'directional sign' },
  { words: /\bdj booths?\b/, spec: { kind: 'prop', catalogId: 'dj-booth' }, label: 'DJ booth' },
  { words: /\b(projection )?screens?\b/, spec: { kind: 'prop', catalogId: 'projection-screen' }, label: 'projection screen' },
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
  { words: /\bbuildings?\b/, spec: { kind: 'building', style: 'office' }, label: 'building', generic: true },
  // Decorations
  { words: /\bpine( trees?)?s?\b|\bfirs?\b|\bspruces?\b|\bevergreens?\b/, spec: { kind: 'tree', style: 'pine' }, label: 'pine tree' },
  { words: /\btrees?\b|\bbush(es)?\b|\boaks?\b/, spec: { kind: 'tree', style: 'round' }, label: 'tree', generic: true },
  { words: /\bstreet ?lights?\b|\blamp ?posts?\b|\blamps?\b|\blights?\b|\bstreet ?lamps?\b/, spec: { kind: 'streetlight' }, label: 'streetlight' },
  { words: /\b(metal|steel) (crates?|boxe?s?)\b/, spec: { kind: 'crate', material: 'metal' }, label: 'metal crate' },
  { words: /\bcrates?\b|\bboxe?s?\b|\bobstacles?\b/, spec: { kind: 'crate', material: 'wood' }, label: 'crate', generic: true },
  // Walls and surfaces
  { words: /\bwalls?\b|\bfences?\b/, spec: { kind: 'wall' }, label: 'wall' },
  { words: /\broads?\b|\bstreets?\b/, spec: { kind: 'platform', material: 'asphalt' }, label: 'road' },
  { words: /\bparks?\b|\blawns?\b|\bgrass( patch(es)?)?\b|\bgardens?\b/, spec: { kind: 'platform', material: 'grass' }, label: 'park' },
  { words: /\bplatforms?\b|\bplazas?\b|\bpads?\b|\bdecks?\b/, spec: { kind: 'platform' }, label: 'platform', generic: true },
]

export const WALL_MATERIAL = /\b(brick|glass|wood(?:en)?|metal|steel|concrete|stone)\b/

/** The object noun that comes first in the phrase ("the houses towers" names the houses). */
export function findFirstObject(t: string): (Entry & { spec: SpawnSpec; word: string }) | null {
  let best: { e: Entry; at: number; len: number } | null = null
  for (const e of OBJECTS) {
    const hit = e.words.exec(t)
    if (hit && (!best || hit.index < best.at || (hit.index === best.at && hit[0].length > best.len))) best = { e, at: hit.index, len: hit[0].length }
  }
  if (!best) return null
  // Re-run the normal lookup on the phrase from that noun on, so looks and sizes still apply.
  return findObject(t.slice(best.at, best.at + best.len))
}

export function findObject(t: string): (Entry & { spec: SpawnSpec; word: string }) | null {
  for (const e of OBJECTS) {
    const hit = e.words.exec(t)
    if (!hit) continue
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
    if (spec.kind === 'building' && !spec.assetId) {
      const look = parseLook(t)
      if (look.roof) spec.roof = look.roof
      if (look.color) spec.color = look.color
      else if (look.material && BUILDING_FINISH[look.material]) spec.color = BUILDING_FINISH[look.material]
    }
    if (spec.kind === 'platform' && !spec.assetId && !spec.material) {
      const m = parseLook(t).material
      if (m && m !== 'brick' && m !== 'glass') spec.material = m
    }
    return { ...e, spec, word: hit[0] }
  }
  return null
}


export const COLORS: Record<string, string> = {
  red: '#c8443a', blue: '#3f72c8', green: '#4f9a52', yellow: '#e2c044', orange: '#e08a3a', purple: '#8a5cc2',
  pink: '#e48fb0', white: '#eeeeea', black: '#2b2b2e', gray: '#8d9196', grey: '#8d9196', brown: '#8a6040',
  beige: '#e6d3b3', teal: '#3a9e9a', cyan: '#4cc4d6', gold: '#c9a640', silver: '#b8bec4', navy: '#2c3e6b',
}
const COLOR_WORD = new RegExp(`\\b(${Object.keys(COLORS).join('|')})\\b`)
const MATERIAL_WORD = /\b(brick|glass|wood(?:en)?|metal|steel|iron|concrete|stone|asphalt|tarmac|grass(?:y)?)\b/

/** "brick", "red", "pitched roofs", "flat roof" anywhere in the phrase. */
export function parseLook(t: string): { material?: MaterialId; color?: string; roof?: RoofType } {
  const out: { material?: MaterialId; color?: string; roof?: RoofType } = {}
  const m = MATERIAL_WORD.exec(t)?.[1]
  if (m) {
    out.material = (m.startsWith('wood') ? 'wood' : m === 'steel' || m === 'iron' ? 'metal' : m === 'stone' ? 'concrete' : m === 'tarmac' ? 'asphalt' : m.startsWith('grass') ? 'grass' : m) as MaterialId
  }
  const c = COLOR_WORD.exec(t)?.[1]
  if (c) out.color = COLORS[c]
  if (/\b(pitched|sloped|slanted|peaked|pointy|triangular|gabled)( roofs?)?\b/.test(t)) out.roof = 'pitched'
  else if (/\bflat( roofs?| tops?)\b/.test(t)) out.roof = 'flat'
  return out
}

type ActorEntry = { words: RegExp; kind: ActorKind; label: string; plural: string }

/** People and vehicles (actors), most specific first. */
export const ACTORS: ActorEntry[] = [
  { words: /\b(delivery|courier) (robots?|bots?|droids?)\b|\bcouriers?\b|\b(robots|bots|droids)\b/, kind: 'courier', label: 'courier robot', plural: 'courier robots' },
  { words: /\b(cars?|vehicles?|trucks?|vans?|carts?|forklifts?|buggies|buggy|jeeps?)\b/, kind: 'vehicle', label: 'vehicle', plural: 'vehicles' },
  {
    words: /\b(people|persons?|pedestrians?|walkers?|workers?|staff|visitors?|attendees?|shoppers?|kids?|children|child|men|man|women|woman|guys?|folks?|characters?|humans?|citizens?|residents?|locals?|tourists?|crowd)\b/,
    kind: 'worker',
    label: 'person',
    plural: 'people',
  },
]

/** Anchor phrases mention "robot" and "goal" without meaning new robots: remove them before noun lookups. */
export const stripPlaces = (t: string) =>
  t.replace(/\b(near|next to|by|beside|around|at|to|toward|towards|from|in front of|behind|close to|of) (the |my )?(robot|bot|goal|destination|flag|target)\b/g, ' ')

export function findActor(t: string): (ActorEntry & { word: string }) | null {
  const s = stripPlaces(t)
  for (const e of ACTORS) {
    const hit = e.words.exec(s)
    if (hit) return { ...e, word: hit[0] }
  }
  return null
}

/** "walking around", "wandering", "heading to the goal". */
export function parseBehaviour(t: string): 'wander' | 'goal' | undefined {
  if (/\b(walk(ing|s)?|head(ing|s)?|go(ing|es)?|mov(e|ing)|driv(e|ing)|run(ning)?|travel(l?ing)?)\b.*\bto (the )?(goal|destination|flag|target)\b/.test(t)) return 'goal'
  if (/\b(walk(ing|s)? (around|about|up and down|along|back and forth)|wander(ing|s)?|stroll(ing|s)?|roam(ing|s)?|mill(ing)? (around|about)|patrol(l?ing|s)?|driv(ing|e) (around|about|up and down)|mov(ing|e) (around|about)|walk(ing)?|pac(e|ing)|circl(e|ing)|loop(ing)?|busy|bustling)\b/.test(t)) return 'wander'
  return undefined
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 }
const PLURAL_WORD = /(s|people|men|children|staff|crowd|folks|shelves)$/

/**
 * A spoken reference to existing things, or null when the phrase names none:
 *   it / that / this, them / those / these, the houses, the second house, all the trees, the people.
 * Indefinite phrases ("a house", "three trees") are new things, not references.
 */
export function parseTarget(t: string): Target | null {
  return parseTargetSpan(t)?.target ?? null
}

/** `parseTarget`, plus the rest of the phrase after the named thing ("make the house | brick"). */
export function parseTargetSpan(t: string): { target: Target; after: string } | null {
  const s = stripPlaces(t)
  const ref = /\b(?:the|all(?: of)?(?: the)?|every|each|those|these|that|this|my|your|our)\s+((?:[a-z]+\s+){0,3}?[a-z]+)\b/.exec(s)
  if (ref) {
    const phrase = s.slice(ref.index)
    const all = /^(all|every|each)\b/.test(phrase)
    const ord = /^the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|(\d+)(?:st|nd|rd|th))\b/.exec(phrase)
    const actor = findActor(phrase)
    const obj = findFirstObject(phrase)
    // Whichever noun comes first in the phrase is the one being named.
    const actorAt = actor ? phrase.indexOf(actor.word) : Infinity
    const objAt = obj ? phrase.indexOf(obj.word) : Infinity
    const word = actorAt < objAt ? actor!.word : obj?.word
    if (word && Math.min(actorAt, objAt) < 40) {
      const plural = all || PLURAL_WORD.test(word) || /^(those|these)\b/.test(phrase)
      const ordinal = ord ? (ord[1] === 'last' ? undefined : ORDINALS[ord[1]] ?? Number(ord[2])) : undefined
      const after = phrase.slice(Math.min(actorAt, objAt) + word.length)
      if (actorAt < objAt) return { target: { actor: actor!.kind, plural, all, ordinal, label: plural ? actor!.plural : actor!.label }, after }
      const spec = obj!.spec
      const target: Target = { kind: spec.kind, plural, all, ordinal, label: obj!.label }
      if (!obj!.generic && spec.style) target.style = spec.style
      if (!obj!.generic && spec.kind === 'platform' && spec.material) target.material = spec.material
      if (spec.catalogId) target.catalogId = spec.catalogId
      if (spec.assetId) target.assetId = spec.assetId
      if (ord?.[1] === 'last') target.plural = false
      return { target, after }
    }
  }
  const them = /\b(them|those|these|they|all of them|everything you made|the group)\b/.exec(s)
  if (them) return { target: { ref: 'them' }, after: s.slice(them.index + them[0].length) }
  const it = /\b(it|that|this|the selection|selected|that one|this one)\b/.exec(s)
  if (it) return { target: { ref: 'it' }, after: s.slice(it.index + it[0].length) }
  return null
}

/**
 * Words AssemblyAI should listen for (sent as `keyterms_prompt`; at most 100 terms, 50 chars each).
 * Domain words it otherwise mishears: "lamppost", "streetlight", "asphalt", "pitched roofs".
 */
export const VOICE_KEYTERMS: string[] = [
  'lamppost', 'lampposts', 'streetlight', 'streetlights', 'street lamp', 'road', 'street', 'asphalt', 'plaza', 'platform',
  'house', 'houses', 'tower', 'towers', 'skyscraper', 'office block', 'warehouse', 'industrial building', 'brick', 'glass',
  'concrete', 'wooden', 'metal', 'pitched roof', 'pitched roofs', 'flat roof', 'pine trees', 'trees', 'crates', 'wall',
  'fence', 'park', 'lawn', 'people', 'pedestrians', 'workers', 'courier robots', 'delivery robots', 'vehicles', 'forklifts',
  'walking around', 'wandering', 'along the road', 'in a row', 'between', 'neighbourhood', 'neighborhood', 'town square',
  'main street', 'downtown', 'parking lot', 'industrial yard', 'street market', 'booths', 'stage', 'registration desk',
  'storage racks', 'conveyor', 'charging pad', 'loading bay', 'duplicate', 'rotate', 'resize', 'undo', 'redo', 'goal',
  'destination', 'robot', 'RealmForge', 'Forge District', 'Mars outpost',
]
