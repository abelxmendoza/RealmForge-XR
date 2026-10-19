import type { Placement } from '../world/spawn'
import type { Target } from '../world/targets'
import type { ObjectPatch, SizeAxis } from '../world/edit'
import { RECIPES, recipeCommands, type RecipeId } from '../world/recipes'
import { parseObjectCommand } from './objectCommands'
import type { VoiceCommand } from './types'
import { findActor, findObject, parseAnchor, parseBehaviour, parseCount, parseLook, parseTargetSpan, NUMBER_WORDS, SOUND_ALIKES } from './vocabulary'

/**
 * Whole-scene voice grammar (deterministic, no LLM):
 *
 *   add 3 lampposts, a road and two houses with a few people walking around   → one BATCH, laid out as a street
 *   add two brick houses with pitched roofs                                   → "with …" describing a thing stays on it
 *   build a small neighbourhood / a busy street / a town square with a stage  → recipes, plus extras
 *   make the houses brick / paint it red / give the houses flat roofs         → EDIT_OBJECTS
 *   make the road 20 meters long / the tower 3 times taller / the road longer → SIZE_OBJECTS
 *   remove the trees / delete the people / get rid of it                      → DELETE_OBJECTS
 *   have the people walk around / send the workers to the goal / make them stop / make the cars faster
 *   add a few people walking around near the goal                             → SPAWN_ACTORS
 *
 * Each clause of a sentence is parsed on its own; a clause without a verb borrows the verb before it.
 */

const SCENE_TYPES = new Set<VoiceCommand['type']>([
  'SPAWN_OBJECTS',
  'SPAWN_ACTORS',
  'MOVE_OBJECTS',
  'ROTATE_OBJECTS',
  'RESIZE_OBJECTS',
  'DUPLICATE_OBJECTS',
  'SIZE_OBJECTS',
  'EDIT_OBJECTS',
  'DELETE_OBJECTS',
  'ACTOR_BEHAVIOUR',
  'BATCH',
])
export const isSceneCommand = (c: VoiceCommand) => SCENE_TYPES.has(c.type)

const POLITE = /^(?:(?:please|can you|could you|would you|i want(?: you)? to|i want|id like(?: you)? to|id like|i would like(?: you)? to|i would like|lets|now|ok|okay|also|and|then|go ahead and|just)\s+)*/
const VERB =
  /^(add|create|place|put|spawn|generate|build|make|give me|give|drop|plant|set up|i need|we need|include|insert|move|shift|slide|push|bring|drag|rotate|turn|spin|duplicate|copy|clone|delete|remove|get rid of|erase|destroy|clear|paint|color|colour|change|set|have|let|send|tell|stop|stretch|extend|lengthen|widen|shrink|scale|resize)\b/

/** Split "add 3 lampposts, a road and two houses with a few people" into clauses. */
export function splitClauses(text: string): string[] {
  // "between the road and the tower" is one place, not two clauses.
  const protectedText = text.replace(/\bbetween (.+?) and /g, 'between $1 & ').replace(/\bup and down\b/g, 'up-and-down').replace(/\bback and forth\b/g, 'back-and-forth')
  return protectedText
    .split(/\s*[,;.]\s*|\s+(?:and then|and also|then|plus|as well as|along with|followed by|and|with|also)\s+/)
    .map((s) => s.replace(/\bup-and-down\b/g, 'up and down').replace(/\bback-and-forth\b/g, 'back and forth').replace(/^and\s+/, '').trim())
    .filter(Boolean)
}

const SIZE_WORD = /\b(longer|shorter|wider|narrower|thinner|thicker|taller|higher|bigger|larger|smaller|tinier|lower)\b/
const DIMENSION = /\b(\d+(?:\.\d+)?|[a-z]+)\s*(?:m|meters?|metres?|units?)?\s*(long|wide|tall|high|deep|across|thick)\b/
const TIMES = /\b(\d+(?:\.\d+)?|twice|double|triple|half|[a-z]+)\s*(?:times|x)?\s*(?:as\s+)?(longer|wider|taller|higher|bigger|larger|smaller|long|wide|tall|big|large)\b/

const LINEAR: Record<string, boolean> = { wall: true, platform: true }
const wordNumber = (w: string) => Number(w) || NUMBER_WORDS[w] || SOUND_ALIKES[w] || (w === 'twice' || w === 'double' ? 2 : w === 'triple' ? 3 : w === 'half' ? 0.5 : NaN)

/** "make the road 20 meters long", "make it 3 times taller", "make the road longer". */
function parseSize(t: string, target: Target): VoiceCommand | null {
  const dim = DIMENSION.exec(t)
  if (dim) {
    const metres = wordNumber(dim[1])
    if (!Number.isFinite(metres) || metres <= 0) return null
    const axis: SizeAxis = dim[2] === 'long' ? 'length' : dim[2] === 'wide' || dim[2] === 'across' || dim[2] === 'deep' || dim[2] === 'thick' ? 'width' : 'height'
    return { type: 'SIZE_OBJECTS', target, axis, metres }
  }
  const times = TIMES.exec(t)
  const word = SIZE_WORD.exec(t)?.[1] ?? times?.[2]
  if (!word) return null
  let factor = times && /\btimes\b|\bx\b|twice|double|triple|half/.test(times[0]) ? wordNumber(times[1]) : 1.5
  if (!Number.isFinite(factor) || factor <= 0) factor = 1.5
  const linear = target.kind ? LINEAR[target.kind] : false
  if (/^(longer|long)$/.test(word)) return { type: 'SIZE_OBJECTS', target, axis: 'length', factor }
  if (word === 'shorter') return { type: 'SIZE_OBJECTS', target, axis: linear ? 'length' : 'height', factor: 1 / factor }
  if (/^(wider|wide|thicker)$/.test(word)) return { type: 'SIZE_OBJECTS', target, axis: 'width', factor }
  if (/^(narrower|thinner)$/.test(word)) return { type: 'SIZE_OBJECTS', target, axis: 'width', factor: 1 / factor }
  if (/^(taller|higher|tall)$/.test(word)) return { type: 'SIZE_OBJECTS', target, axis: 'height', factor }
  if (word === 'lower') return { type: 'SIZE_OBJECTS', target, axis: 'height', factor: 1 / factor }
  if (/^(smaller|tinier)$/.test(word)) return { type: 'SIZE_OBJECTS', target, axis: 'all', factor: 1 / factor }
  return { type: 'SIZE_OBJECTS', target, axis: 'all', factor }
}

/** "make the houses brick", "paint it red", "turn the tower into an office", "pitched roofs". */
function parseEdit(target: Target, after: string): VoiceCommand | null {
  // Look words after the reference: "make the brick houses red" keeps "brick" as part of the name.
  const look = parseLook(after)
  const patch: ObjectPatch = {}
  if (look.material) patch.material = look.material
  if (look.color) patch.color = look.color
  if (look.roof) patch.roof = look.roof
  const style = findObject(after.replace(/\broofs?\b/g, ''))
  if (style && (style.spec.kind === 'building' || style.spec.kind === 'tree') && style.spec.style && !style.generic) patch.style = style.spec.style
  if (/\b(solid|an obstacle|obstacles|block(ing)? the (robot|path|way))\b/.test(after)) patch.solid = true
  if (/\b(walkable|passable|not solid|let the robot through|not block|non ?blocking|see ?through)\b/.test(after)) patch.solid = false
  return Object.keys(patch).length ? { type: 'EDIT_OBJECTS', target, patch } : null
}

const RECIPE_SIZE: [RegExp, number][] = [
  [/\b(tiny|mini)\b/, 0.4],
  [/\b(small|little|quiet|cosy|cozy)\b/, 0.6],
  [/\b(big|large|busy|bustling|lively)\b/, 1.5],
  [/\b(huge|giant|massive|enormous|sprawling)\b/, 2],
]

function parseRecipe(t: string): VoiceCommand | null {
  if (!/^(add|create|build|make|generate|set up|give me|place|put|spawn|i need|we need|design|lay out)\b/.test(t)) return null
  for (const [id, r] of Object.entries(RECIPES) as [RecipeId, (typeof RECIPES)[RecipeId]][]) {
    if (!r.words.test(t)) continue
    const scale = RECIPE_SIZE.find(([w]) => w.test(t))?.[1] ?? 1
    const anchor = parseAnchor(t.replace(r.words, ''))
    const placement: Placement = anchor && anchor !== 'selected' ? { anchor } : {}
    return { type: 'BATCH', commands: recipeCommands(id, scale, placement), skipped: [], summary: r.label }
  }
  return null
}

/** "add a few people walking around", "two delivery robots near the goal". */
function parseActorSpawn(t: string): VoiceCommand | null {
  if (!/^(add|create|place|put|spawn|generate|make|give me|drop|i need|we need|include|insert|bring in|bring)\b/.test(t)) return null
  const actor = findActor(t)
  if (!actor) return null
  const rest = t.replace(/^\w+(\s+(me|in))?\s+/, '')
  let count = parseCount(rest.slice(0, rest.indexOf(actor.word) + actor.word.length), /s$|people|men|children|crowd/.test(actor.word) ? 3 : 1)
  if (/\bcrowd\b/.test(actor.word)) count = Math.max(count, 8)
  const first = rest.split(' ')[0]
  if (count === 1 && first in SOUND_ALIKES) count = SOUND_ALIKES[first]
  const anchor = parseAnchor(t.slice(t.indexOf(actor.word) + actor.word.length).replace(/\bto (the )?(goal|destination)\b/, ''))
  const placement: Placement = anchor && anchor !== 'selected' ? { anchor } : /\bhere\b/.test(t) ? { anchor: 'selected' } : {}
  const behaviour = parseBehaviour(t)
  return {
    type: 'SPAWN_ACTORS',
    actorKind: actor.kind,
    label: actor.label,
    count: Math.max(1, Math.min(32, count)),
    placement,
    ...(behaviour ? { behaviour } : {}),
  }
}

/** "have the people walk around", "send the workers to the goal", "make them stop", "make the cars faster". */
function parseActorBehaviour(t: string, target: Target | null): VoiceCommand | null {
  const actorTarget = target?.actor ? target : target?.ref === 'them' || target?.ref === 'it' ? target : null
  if (!actorTarget) return null
  const describesActor = Boolean(target?.actor)
  if (/\b(stop|halt|freeze|stand still|stay put|wait)\b/.test(t)) return { type: 'ACTOR_BEHAVIOUR', target: actorTarget, behaviour: 'stop' }
  if (/\b(faster|quicker|speed (them |it )?up|hurry|run)\b/.test(t) && (describesActor || /\b(walk|move|go)\b/.test(t) || /^make (them|it) (faster|quicker)/.test(t)))
    return { type: 'ACTOR_BEHAVIOUR', target: actorTarget, behaviour: 'faster' }
  if (/\b(slower|slow (them |it )?down)\b/.test(t) && (describesActor || /^make (them|it) slower/.test(t))) return { type: 'ACTOR_BEHAVIOUR', target: actorTarget, behaviour: 'slower' }
  const b = parseBehaviour(t) ?? (/^send\b.*\bto (the )?(goal|destination|flag|target)\b/.test(t) ? 'goal' : undefined)
  if (b && (describesActor || /^(have|let|tell|get|make|send)\b/.test(t))) return { type: 'ACTOR_BEHAVIOUR', target: actorTarget, behaviour: b }
  return null
}

const EDIT_VERB = /^(make|paint|color|colour|turn|change|set|give|switch|use|convert)\b/
const SIZE_VERB = /^(make|set|stretch|extend|lengthen|widen|shrink|scale|resize|grow)\b/
const DELETE_VERB = /^(delete|remove|get rid of|erase|destroy|clear( away| out)?|take away|demolish|knock down|cut down)\b/

/** One clause (one command). Returns null when nothing in the scene grammar matches. */
export function parseSceneClause(raw: string): VoiceCommand | null {
  const t = raw.replace(POLITE, '').trim()
  if (!t) return null
  const recipe = parseRecipe(t)
  if (recipe) return recipe

  const span = parseTargetSpan(t)
  const target = span?.target ?? null
  const after = span?.after ?? ''

  if (DELETE_VERB.test(t) && target) {
    // "clear selection" / "clear world" belong to the editor rules, which run first.
    return { type: 'DELETE_OBJECTS', target }
  }

  const behaviour = parseActorBehaviour(t, target)
  if (behaviour && (target?.actor || !/^(move|rotate|turn|make (it|them) (bigger|smaller|taller|shorter))\b/.test(t))) return behaviour

  // Named things ("the houses") get the new edit/size commands; "it"/"them" keep the old resize grammar.
  if (target && !target.ref && !target.actor) {
    if (SIZE_VERB.test(t)) {
      const size = parseSize(t, target)
      if (size) return size
    }
    if (EDIT_VERB.test(t)) {
      const edit = parseEdit(target, after)
      if (edit) return edit
    }
  }
  if (target?.ref && EDIT_VERB.test(t)) {
    // "make it 20 meters long", "make them 3 times taller", "paint it red", "make them brick".
    if (DIMENSION.test(t) || (TIMES.test(t) && /\btimes\b/.test(t)) || /\b(longer|wider|narrower)\b/.test(t)) {
      const size = parseSize(t, target)
      if (size) return size
    }
    if (!SIZE_WORD.test(t) && !/\b(twice|double|half)\b/.test(t)) {
      const edit = parseEdit(target, after)
      if (edit && !/^turn (it|them) (left|right|around)\b/.test(t)) return edit
    }
  }

  const object = parseObjectCommand(t)
  if (object) return object
  return parseActorSpawn(t)
}

/**
 * The whole sentence: one command, a BATCH of several, or null. A clause without its own verb borrows
 * the previous one ("add a road and two houses"); a verbless clause that means nothing alone describes
 * the thing before it ("two houses with pitched roofs").
 */
export function parseScene(text: string): VoiceCommand | null {
  const clauses = splitClauses(text)
  if (clauses.length <= 1) return parseSceneClause(text)
  const parts: { text: string; command: VoiceCommand | null }[] = []
  let verb = ''
  for (const clause of clauses) {
    const own = VERB.exec(clause.replace(POLITE, ''))
    const full = own ? clause : verb ? `${verb} ${clause}` : clause
    if (own) verb = own[1] === 'give' ? 'give me' : own[1]
    let command = parseSceneClause(full)
    if (!command && !own && parts.length) {
      // "with pitched roofs", "with a red door": glue onto the clause before and parse that again.
      const prev = parts[parts.length - 1]
      const glued = parseSceneClause(`${prev.text} ${clause}`)
      // Only when the extra words actually changed something ("pitched roofs"), not when they were ignored.
      if (glued && prev.command && glued.type === prev.command.type && JSON.stringify(glued) !== JSON.stringify(prev.command)) {
        prev.text = `${prev.text} ${clause}`
        prev.command = glued
        continue
      }
    }
    // "add a road with people walking": a behaviour with no verb of its own is about the people.
    if (!command && !own && parseBehaviour(clause) && findActor(clause)) command = parseSceneClause(`add ${clause}`)
    parts.push({ text: full, command })
  }
  const commands = parts.map((p) => p.command).filter((c): c is VoiceCommand => Boolean(c))
  if (!commands.length) return null
  if (commands.length === 1 && parts.length === 1) return commands[0]
  // A sentence mixing scene edits with editor commands ("save and add a tree") is left to the old path.
  if (!commands.every(isSceneCommand)) return null
  const skipped = parts.filter((p) => !p.command).map((p) => p.text)
  return { type: 'BATCH', commands: flatten(commands), skipped }
}

const flatten = (cs: VoiceCommand[]): VoiceCommand[] => cs.flatMap((c) => (c.type === 'BATCH' ? flatten(c.commands) : [c]))
