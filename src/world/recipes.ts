import type { Placement, SpawnSpec } from './spawn'
import type { ActorKind } from '../actors/types'
import type { ActorBehaviour } from './compose'
import type { VoiceCommand } from '../voice/types'

/**
 * Whole scenes from one phrase ("build a small neighbourhood"). A recipe is just the list of
 * spawn commands a person would have said, so it goes through the same layout, checks and undo.
 * `scale` (small 0.6, big 1.5, huge 2) multiplies the counts.
 */

type Piece = { spec: SpawnSpec; label: string; count: number } | { actor: ActorKind; label: string; count: number; behaviour?: ActorBehaviour }

export type RecipeId = 'street' | 'neighbourhood' | 'townSquare' | 'park' | 'parkingLot' | 'industrialYard' | 'market' | 'downtown'

const road = (count = 1): Piece => ({ spec: { kind: 'platform', material: 'asphalt' }, label: 'road', count })
const houses = (count: number): Piece => ({ spec: { kind: 'building', style: 'house' }, label: 'house', count })
const lights = (count: number): Piece => ({ spec: { kind: 'streetlight' }, label: 'streetlight', count })
const trees = (count: number, style: 'round' | 'pine' = 'round'): Piece => ({ spec: { kind: 'tree', style }, label: style === 'pine' ? 'pine tree' : 'tree', count })
const people = (count: number, behaviour: ActorBehaviour = 'wander'): Piece => ({ actor: 'worker', label: 'person', count, behaviour })

// First match wins, so specific scenes ("village square", "residential street") sit above the
// broad neighbourhood words.
export const RECIPES: Record<RecipeId, { label: string; words: RegExp; pieces: Piece[] }> = {
  townSquare: {
    label: 'town square',
    words: /\b(town|city|village|market|public) squares?\b|\bpiazza\b/,
    pieces: [{ spec: { kind: 'platform', material: 'concrete', scale: 2.5 }, label: 'plaza', count: 1 }, { spec: { kind: 'building', style: 'office' }, label: 'office block', count: 2 }, trees(4), lights(4), people(6)],
  },
  downtown: {
    label: 'downtown',
    words: /\b(downtown|city cent(er|re)|business district|skyline|financial district)\b/,
    pieces: [road(), { spec: { kind: 'building', style: 'tower' }, label: 'tower', count: 4 }, { spec: { kind: 'building', style: 'office' }, label: 'office block', count: 2 }, lights(6), people(6)],
  },
  park: {
    label: 'park',
    words: /\b(city|public|little|small|big|nice|green|town) parks?\b|\bpark (scene|area)\b|\bgreen space\b/,
    pieces: [{ spec: { kind: 'platform', material: 'grass', scale: 3 }, label: 'lawn', count: 1 }, trees(5), trees(3, 'pine'), lights(3), people(4)],
  },
  parkingLot: {
    label: 'parking lot',
    words: /\b(parking (lot|area|garage)|car park)s?\b/,
    pieces: [{ spec: { kind: 'platform', material: 'asphalt', scale: 1.5 }, label: 'parking area', count: 1 }, lights(2), { actor: 'vehicle', label: 'vehicle', count: 4, behaviour: 'idle' }],
  },
  industrialYard: {
    label: 'industrial yard',
    words: /\b(industrial (yard|area|zone|estate|park|site)|factory yard|freight yard|depot|shipping yard)\b/,
    pieces: [road(), { spec: { kind: 'building', style: 'industrial' }, label: 'industrial building', count: 2 }, { spec: { kind: 'crate', material: 'metal' }, label: 'metal crate', count: 6 }, lights(3), { actor: 'courier', label: 'courier robot', count: 2, behaviour: 'wander' }],
  },
  market: {
    label: 'market',
    words: /\b(street market|marketplace|market|bazaar|fair ?ground|food stalls?)\b/,
    pieces: [road(), { spec: { kind: 'prop', catalogId: 'exhibition-booth' }, label: 'stall', count: 6 }, lights(4), people(8)],
  },
  street: {
    label: 'street',
    words: /\b(main|high|city|busy|quiet|shopping|residential) streets?\b|\bstreet scene\b|\bboulevard\b|\bavenue\b/,
    pieces: [road(), houses(4), trees(4), lights(4), people(3)],
  },
  neighbourhood: {
    label: 'neighbourhood',
    words: /\b(neighbou?rhoods?|suburbs?|residential (area|street|block)|village|hamlet|housing estate|cul de sac)\b/,
    pieces: [road(), houses(6), trees(6), lights(4), people(4)],
  },
}

export function recipeCommands(id: RecipeId, scale = 1, placement: Placement = {}): VoiceCommand[] {
  const n = (count: number) => Math.max(1, Math.round(count * scale))
  return RECIPES[id].pieces.map((p): VoiceCommand =>
    'actor' in p
      ? { type: 'SPAWN_ACTORS', actorKind: p.actor, label: p.label, count: n(p.count), placement, ...(p.behaviour ? { behaviour: p.behaviour } : {}) }
      : { type: 'SPAWN_OBJECTS', spec: p.spec, label: p.label, count: p.spec.kind === 'platform' ? p.count : n(p.count), placement: { anchor: 'auto', ...placement } },
  )
}

/** For help text: what to say to get each recipe. */
export const RECIPE_EXAMPLES = ['a small neighbourhood', 'a busy main street', 'a town square', 'downtown', 'a city park', 'a parking lot', 'an industrial yard', 'a street market']
