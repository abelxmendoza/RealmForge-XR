import type { AnchorName, Placement } from '../world/spawn'
import type { Target } from '../world/targets'
import type { VoiceCommand } from './types'
import { NUMBER_WORDS, SOUND_ALIKES, findActor, findObject, parseAnchor, parseCount, parseDegrees, parseDirection, parseDistance, parseTarget } from './vocabulary'

export { parseCount } from './vocabulary'

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
 *   … along the road / in a row / around the robot / near the houses / between the road and the tower
 *   move|rotate|resize|duplicate the houses / the second tree / all the crates
 *
 * "it" = the selected object (else the last thing made); "them" = everything made by the last command.
 */

const SPAWN_VERB = /^(?:(?:please|can you|could you|i want|i'd like|let's|lets)\s+)*(add|create|place|put|spawn|generate|build|make|give me|drop|plant|set up|i need|we need)\b/
const THEM = /\b(them|those|these|they|all of them|the group|everything you made)\b/

/** A named target ("the houses") when the phrase has one; "it" / "them" stay on `which`. */
function named(t: string): { target?: Target } {
  const target = parseTarget(t)
  return target && !target.ref ? { target } : {}
}

/** Where the object noun ends and the "where" part begins: "two houses | along the road". */
const RELATION = /\b(near|next to|by|beside|besides|around|along|alongside|lining|line|between|behind|in front of|on (?:both|either|each|the other) sides?|on (?:one|each) side|facing|close to|at|in|of|surrounding|circling|across from|opposite)\b/

/** "along the road", "in a row", "around the goal", "near the houses", "between the road and the tower". */
function parsePlacement(rel: string): { placement: Placement; alongRoad?: boolean } {
  const placement: Placement = {}
  let alongRoad: boolean | undefined
  if (/\b(along|alongside|lining|line|beside|besides|next to|on (?:both|either|each|one|the other) sides?|facing|by|across from|opposite)\b.*\b(roads?|streets?|avenues?)\b|\b(along|alongside|lining)\b/.test(rel)) alongRoad = true
  if (/\bin (a )?(row|line|column)\b|\bside by side\b/.test(rel)) placement.arrange = 'row'
  if (/\b(around|surrounding|circling|in a (circle|ring))\b/.test(rel)) placement.arrange = 'ring'
  const between = /\bbetween (.+?) (?:and|&) (.+)$/.exec(rel)
  if (between) {
    const a = parseTarget(`the ${between[1].replace(/^the /, '')}`)
    const b = parseTarget(`the ${between[2].replace(/^the /, '')}`)
    const anchorA = parseAnchor(between[1])
    const anchorB = parseAnchor(between[2])
    if (a && b && !a.ref && !b.ref) placement.between = [a, b]
    else if (anchorA || anchorB) placement.anchor = (anchorA ?? anchorB) as AnchorName
    return { placement, alongRoad: false }
  }
  if (!alongRoad) {
    const near = parseTarget(rel)
    if (near && !near.ref) placement.near = near
  }
  if (!placement.near) {
    const anchor = parseAnchor(rel)
    if (anchor && anchor !== 'selected') placement.anchor = anchor
    else if (anchor === 'selected' && /\b(here|there|it|that|selected|selection)\b/.test(rel)) placement.anchor = 'selected'
  }
  const direction = alongRoad ? undefined : parseDirection(rel)
  if (direction) {
    placement.direction = direction
    placement.distance = parseDistance(rel)
  }
  return { placement, alongRoad }
}

/** Parse object commands. Returns null when the phrase isn't about objects. */
export function parseObjectCommand(t: string): VoiceCommand | null {
  const which = THEM.test(t) ? 'last' : 'selected'

  // Duplicate: "duplicate it 3 times", "make 4 copies", "copy that", "5 more"
  const moreOfSame = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) more\b/.test(t) && !findObject(t)
  if (/\b(duplicate|copy|clone|copies)\b/.test(t) || moreOfSame) {
    const times = /\b(\d+|[a-z]+) (?:times|copies|more|clones)\b/.exec(t)
    const count = times ? (Number(times[1]) || NUMBER_WORDS[times[1]] || 1) : 1
    return { type: 'DUPLICATE_OBJECTS', which, count: Math.min(25, count), ...named(t) }
  }

  // Move: "move it 10 meters north", "move them left", "move it to the goal"
  if (/^(?:please\s+)?(move|shift|slide|push|bring|drag)\b/.test(t)) {
    const to = /\bto (the )?(robot|bot|goal|destination|flag|center|centre|middle)\b/.exec(t)
    if (to) return { type: 'MOVE_OBJECTS', which, to: parseAnchor(to[0]) as Exclude<AnchorName, 'auto' | 'selected'>, ...named(t.slice(0, to.index)) }
    const direction = parseDirection(t)
    if (!direction) return null
    return { type: 'MOVE_OBJECTS', which, direction, distance: parseDistance(t), ...named(t) }
  }

  // Rotate: "rotate it 45 degrees", "turn them left", "spin it around"
  if (/^(?:please\s+)?(rotate|turn|spin)\b/.test(t)) {
    let deg = parseDegrees(t) ?? 90
    if (/\b(right|clockwise)\b/.test(t) && !/\bcounter ?clockwise\b/.test(t)) deg = -Math.abs(deg)
    return { type: 'ROTATE_OBJECTS', which, degrees: deg, ...named(t) }
  }

  // Resize: "make it bigger", "make them twice as big", "make it taller"
  const resize = /\b(bigger|larger|smaller|tinier|taller|higher|shorter|lower|twice as (big|large|tall)|double (the )?size|half (the )?size|wider|narrower|grow|shrink|scale (it|them) up|scale (it|them) down)\b/.exec(t)
  if (resize && /^(?:please\s+)?(make|scale|grow|shrink|resize)\b/.test(t)) {
    const w = resize[0]
    const tgt = named(t)
    if (/taller|higher/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'height', ...tgt }
    if (/shorter|lower/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'height', ...tgt }
    if (/wider/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'footprint', ...tgt }
    if (/narrower/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'footprint', ...tgt }
    if (/twice|double/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 2, axis: 'all', ...tgt }
    if (/half/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 0.5, axis: 'all', ...tgt }
    if (/smaller|tinier|shrink|down/.test(w)) return { type: 'RESIZE_OBJECTS', which, factor: 1 / 1.5, axis: 'all', ...tgt }
    return { type: 'RESIZE_OBJECTS', which, factor: 1.5, axis: 'all', ...tgt }
  }

  // Spawn: "add three trees near the robot", "build two glass towers 20 meters north of the goal"
  const verb = SPAWN_VERB.exec(t)
  if (!verb) return null
  // Skip the verb itself when counting ("make" has no number, but "add to trees" means 2).
  const rest = t.slice(verb.index + verb[0].length).trim()
  // The object is named before any "where" words, so "a road near the houses" is a road.
  const relAt = RELATION.exec(rest)
  const headText = relAt ? rest.slice(0, relAt.index).trim() : rest
  const obj = findObject(headText) ?? (relAt ? null : findObject(rest))
  if (!obj) return null
  // "add three people" is for the actor parser; "add a house with people" was split before here.
  const actor = findActor(headText)
  if (actor && headText.indexOf(actor.word) < headText.indexOf(obj.word)) return null
  // A bare plural ("add trees") means a few, not one.
  const bare = /s$/.test(obj.word) && !/ss$/.test(obj.word) && !/\b(a|an|one|single)\b/.test(headText)
  let count = parseCount(headText, bare ? 3 : 1)
  const first = rest.split(' ')[0]
  if (first in SOUND_ALIKES && parseCount(headText, 0) === 0) count = SOUND_ALIKES[first]
  const relText = relAt ? rest.slice(relAt.index) : ''
  const { placement, alongRoad } = relText ? parsePlacement(relText) : { placement: {} as Placement, alongRoad: undefined }
  if (!relText && /\bhere\b/.test(rest)) placement.anchor = 'selected'
  // A direction with no "of …" still offsets from the usual spot ("20 meters north").
  if (!placement.direction) {
    const direction = parseDirection(headText.replace(obj.word, ''))
    if (direction && /\b(north|south|east|west)\b/.test(headText)) {
      placement.direction = direction
      placement.distance = parseDistance(headText)
    }
  }
  return {
    type: 'SPAWN_OBJECTS',
    spec: obj.spec,
    label: obj.label,
    count: Math.max(1, Math.min(25, count)),
    placement: { anchor: placement.anchor ?? 'auto', ...placement, ...(placement.direction ? {} : { direction: undefined, distance: undefined }) },
    ...(alongRoad ? { alongRoad: true } : {}),
  }
}
