/**
 * Runs the scene commands (make, shape, name, delete, people) and whole-sentence BATCHes.
 * Everything here is synchronous world edits except the up-front delete confirmation, so a BATCH
 * can run inside one undo step without holding the "dragging" flag across a dialog.
 */

import { composeScene, type SceneActors, type SceneItem, type SceneLine } from '../world/compose'
import { deleteThings, editObjects, sizeObjects } from '../world/edit'
import { duplicateObjects, moveObjects, oneUndoStep, resizeObjects, rotateObjects, spawnObjects, targetIds } from '../world/spawn'
import { resolveActors, resolveObjects, setLastActorBatch, type Target } from '../world/targets'
import { useWorld } from '../world/store'
import { WORLD, type Vec2 } from '../world/types'
import { scaleActorSpeed, setActorGoal, setActorLoop, stopActors } from '../actors/actions'
import { getActorRuntime } from '../actors/runtime'
import type { VoiceCommand } from './types'

export type SceneOutcome = { ok: boolean; message: string }

const VOWEL = /^[aeiou]/i
const PLURALS: Record<string, string> = { person: 'people', 'courier robot': 'courier robots', 'DJ booth': 'DJ booths', 'pallet rack': 'pallet racks', 'storage rack': 'storage racks' }
export const plural = (label: string) => PLURALS[label] ?? (/(s|x|ch|sh)$/.test(label) ? `${label}es` : `${label}s`)
const article = (label: string) => (VOWEL.test(label) ? `an ${label}` : `a ${label}`)

export function describeLine(l: SceneLine): string {
  const noun = l.made === 1 ? article(l.label) : `${l.made} ${plural(l.label)}`
  const short = l.made < l.requested ? ` (${l.requested} asked, out of room)` : ''
  const doing = l.actor && l.behaviour === 'wander' && l.made ? ' walking around' : l.actor && l.behaviour === 'goal' && l.made ? ' heading to the goal' : ''
  return `${noun}${doing}${short}`
}

export const joinList = (parts: string[]) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

const singular = (label: string) => (label === 'people' ? 'person' : label === 'courier robots' ? 'courier robot' : label === 'vehicles' ? 'vehicle' : label)
const thingWord = (n: number, t?: Target) => {
  if (!t?.label) return n === 1 ? 'it' : `${n} things`
  const base = singular(t.label)
  return n === 1 ? `the ${base}` : `${n} ${plural(base)}`
}

function objectIds(command: { which?: 'selected' | 'last'; target?: Target }): string[] {
  if (command.target) return resolveObjects(command.target)
  return targetIds(command.which ?? 'selected')
}

/** How many things a DELETE would remove (for the confirmation question). */
export function deleteCount(target: Target): number {
  return resolveObjects(target).length + resolveActors(target).length
}

/**
 * The question to ask before running these commands, or null. Big deletes (more than 3 things)
 * ask. So does any delete that follows another command in the same batch: earlier clauses can
 * change what it matches ("make the houses towers and remove the towers"), so it is not counted.
 */
export function deleteQuestion(commands: VoiceCommand[]): string | null {
  for (const [i, c] of commands.entries()) {
    if (c.type !== 'DELETE_OBJECTS') continue
    if (i > 0) return `Run all of that, including removing ${c.target.label ? `the ${plural(singular(c.target.label))}` : 'things'}?`
    const n = deleteCount(c.target)
    if (n > 3) return `Delete ${thingWord(n, c.target)}?`
  }
  return null
}

function moveActors(ids: string[], command: Extract<VoiceCommand, { type: 'MOVE_OBJECTS' }>): number {
  let n = 0
  for (const id of ids) {
    if (command.to === 'goal') {
      const goal = useWorld.getState().goal
      if (goal && setActorGoal(id, goal).ok) n++
      continue
    }
    const a = useWorld.getState().actors[id]
    if (!a) continue
    const from = getActorRuntime(id)?.position ?? a.position
    const DIR: Record<string, Vec2> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }
    const target: Vec2 = command.to === 'robot' ? [...useWorld.getState().robotStart] : command.to === 'center' ? [0, 0] : [from[0] + (DIR[command.direction ?? 'north'][0] * (command.distance ?? 5)), from[1] + DIR[command.direction ?? 'north'][1] * (command.distance ?? 5)]
    const clamped: Vec2 = [Math.max(-WORLD.half + 1, Math.min(WORLD.half - 1, target[0])), Math.max(-WORLD.half + 1, Math.min(WORLD.half - 1, target[1]))]
    // Walking there looks better than teleporting, and stays on the navigation grid.
    if (setActorGoal(id, clamped).ok) n++
  }
  return n
}

function wanderStops(id: string, i: number): Vec2[] {
  const a = useWorld.getState().actors[id]
  const p = getActorRuntime(id)?.position ?? a.position
  const r = 6 + (i % 3) * 2
  const square: Vec2[] = [[p[0] + r, p[1]], [p[0], p[1] + r], [p[0] - r, p[1]], [p[0], p[1] - r]]
  return square.slice(i % 4).concat(square.slice(0, i % 4))
}

/** One non-spawn scene command. */
export function runSceneCommand(command: VoiceCommand): SceneOutcome {
  switch (command.type) {
    case 'SPAWN_OBJECTS': {
      if (command.alongRoad) return runSpawns([command])
      const { ids, requested } = spawnObjects(command.spec, command.count, command.placement)
      if (!ids.length) return { ok: false, message: `No free space for ${plural(command.label)} there` }
      const noun = ids.length === 1 ? command.label : plural(command.label)
      return { ok: true, message: ids.length < requested ? `Added ${ids.length} of ${requested} ${noun} (out of free space)` : `Added ${ids.length} ${noun}` }
    }
    case 'SPAWN_ACTORS':
      return runSpawns([command])
    case 'MOVE_OBJECTS':
    case 'ROTATE_OBJECTS':
    case 'RESIZE_OBJECTS':
    case 'DUPLICATE_OBJECTS': {
      const actorIds = command.target?.actor ? resolveActors(command.target) : command.which === 'last' && !command.target ? resolveActors({ ref: 'them' }) : []
      if (command.type === 'MOVE_OBJECTS' && actorIds.length) {
        const n = moveActors(actorIds, command)
        return n ? { ok: true, message: `Sent ${thingWord(n, command.target)} ${command.to ? `to the ${command.to}` : command.direction}` } : { ok: false, message: 'No route for them there' }
      }
      const ids = objectIds(command)
      if (!ids.length) return { ok: false, message: command.target?.label ? `There's no ${command.target.label} to change` : 'Nothing selected. Select an object or add some first.' }
      const things = command.target ? thingWord(ids.length, command.target) : ids.length === 1 ? 'object' : `${ids.length} objects`
      if (command.type === 'MOVE_OBJECTS') {
        moveObjects(ids, command)
        return { ok: true, message: command.to ? `Moved ${things} to the ${command.to}` : `Moved ${things} ${command.distance ?? 5} m ${command.direction}` }
      }
      if (command.type === 'ROTATE_OBJECTS') {
        rotateObjects(ids, command.degrees)
        return { ok: true, message: `Rotated ${things} ${Math.abs(command.degrees)}°` }
      }
      if (command.type === 'RESIZE_OBJECTS') {
        resizeObjects(ids, command.factor, command.axis)
        return { ok: true, message: `Resized ${things}` }
      }
      const r = duplicateObjects(ids[ids.length - 1], command.count)
      return r.ids.length ? { ok: true, message: `Made ${r.ids.length} ${r.ids.length === 1 ? 'copy' : 'copies'}` } : { ok: false, message: 'No free space for copies' }
    }
    case 'SIZE_OBJECTS': {
      const ids = resolveObjects(command.target)
      if (!ids.length) return { ok: false, message: `There's no ${command.target.label ?? 'object'} to resize` }
      sizeObjects(ids, command.axis, { factor: command.factor, metres: command.metres })
      const how = command.metres ? `to ${command.metres} m ${command.axis === 'length' ? 'long' : command.axis === 'width' ? 'wide' : 'tall'}` : command.factor && command.factor < 1 ? 'smaller' : command.axis === 'length' ? 'longer' : command.axis === 'width' ? 'wider' : command.axis === 'height' ? 'taller' : 'bigger'
      return { ok: true, message: `Made ${thingWord(ids.length, command.target)} ${how}` }
    }
    case 'EDIT_OBJECTS': {
      const ids = resolveObjects(command.target)
      if (!ids.length) return { ok: false, message: `There's no ${command.target.label ?? 'object'} to change` }
      const n = editObjects(ids, command.patch)
      if (!n) return { ok: false, message: `That doesn't apply to ${thingWord(ids.length, command.target)}` }
      if (command.patch.style && Object.keys(command.patch).length === 1) {
        const style = command.patch.style === 'industrial' ? 'industrial building' : command.patch.style === 'office' ? 'office block' : command.patch.style === 'round' ? 'leafy tree' : command.patch.style === 'pine' ? 'pine tree' : command.patch.style
        return { ok: true, message: `Turned ${thingWord(n, command.target)} into ${n === 1 ? article(style) : plural(style)}` }
      }
      const what = [command.patch.style, command.patch.material, command.patch.color ? 'a new colour' : '', command.patch.roof ? `${command.patch.roof} roofs` : '', command.patch.solid === true ? 'solid' : command.patch.solid === false ? 'walkable' : ''].filter((w): w is string => Boolean(w))
      return { ok: true, message: `Changed ${thingWord(n, command.target)}${what.length ? ` to ${joinList(what)}` : ''}` }
    }
    case 'DELETE_OBJECTS': {
      const objects = command.target.actor ? [] : resolveObjects(command.target)
      const actors = command.target.actor || command.target.ref === 'them' ? resolveActors(command.target) : []
      // "delete them" right after adding people means those people.
      const n = deleteThings(objects, objects.length ? (command.target.actor ? actors : []) : actors)
      return n ? { ok: true, message: `Removed ${thingWord(n, command.target)}` } : { ok: false, message: `There's nothing like that to remove` }
    }
    case 'ACTOR_BEHAVIOUR': {
      const ids = resolveActors(command.target.ref ? { ref: command.target.ref } : command.target)
      // "them" with nothing recent means everyone; "it" needs a selected person.
      const fallback = ids.length ? ids : command.target.ref === 'them' ? Object.keys(useWorld.getState().actors) : []
      if (!fallback.length && command.target.ref === 'it' && Object.keys(useWorld.getState().actors).length) return { ok: false, message: 'Select a person first, or say "the people".' }
      if (!fallback.length) return { ok: false, message: 'There are no people or vehicles yet. Try "add a few people walking around".' }
      let n = 0
      if (command.behaviour === 'stop') n = stopActors(fallback)
      else if (command.behaviour === 'faster') n = scaleActorSpeed(fallback, 1.5)
      else if (command.behaviour === 'slower') n = scaleActorSpeed(fallback, 1 / 1.5)
      else if (command.behaviour === 'goal') {
        const goal = useWorld.getState().goal
        if (!goal) return { ok: false, message: 'No destination set. Say "set destination" first.' }
        for (const id of fallback) {
          useWorld.getState().updateActor(id, { loop: false })
          if (setActorGoal(id, goal).ok) n++
        }
      } else fallback.forEach((id, i) => setActorLoop(id, wanderStops(id, i)).ok && n++)
      const who = command.target.label ? thingWord(n, command.target) : n === 1 ? 'it' : `${n} of them`
      const verb = { stop: 'Stopped', faster: 'Sped up', slower: 'Slowed down', goal: 'Sent', wander: 'Set' }[command.behaviour]
      const tail = command.behaviour === 'goal' ? ' to the goal' : command.behaviour === 'wander' ? ' walking around' : ''
      return n ? { ok: true, message: `${verb} ${who}${tail}` } : { ok: false, message: 'They have no room to move there' }
    }
    case 'BATCH':
      return runBatchSync(command)
    default:
      return { ok: false, message: 'Not a scene command' }
  }
}

type Spawn = Extract<VoiceCommand, { type: 'SPAWN_OBJECTS' | 'SPAWN_ACTORS' }>

/** Lay out a run of spawns from one sentence as one scene. */
function runSpawns(spawns: Spawn[]): SceneOutcome {
  const items: SceneItem[] = []
  const actors: SceneActors[] = []
  let alongRoad = false
  for (const s of spawns) {
    if (s.type === 'SPAWN_OBJECTS') {
      items.push({ spec: s.spec, label: s.label, count: s.count, placement: s.placement })
      alongRoad ||= Boolean(s.alongRoad)
    } else actors.push({ kind: s.actorKind, label: s.label, count: s.count, placement: s.placement, behaviour: s.behaviour })
  }
  const r = composeScene(items, actors, { alongRoad })
  if (actors.length && r.actorIds.length) setLastActorBatch(r.actorIds)
  const made = r.lines.filter((l) => l.made)
  if (!made.length) return { ok: false, message: 'No free space for that' }
  return { ok: true, message: `Added ${joinList(r.lines.map(describeLine).filter((_, i) => r.lines[i].made))}` }
}

/** Run a BATCH (deletes already confirmed). One undo step; one summary line. */
export function runBatchSync(batch: Extract<VoiceCommand, { type: 'BATCH' }>): SceneOutcome {
  const messages: string[] = []
  let anyOk = false
  oneUndoStep(() => {
    let run: Spawn[] = []
    const flush = () => {
      if (!run.length) return
      const r = runSpawns(run)
      anyOk ||= r.ok
      messages.push(r.message)
      run = []
    }
    for (const c of batch.commands) {
      if (c.type === 'SPAWN_OBJECTS' || c.type === 'SPAWN_ACTORS') {
        run.push(c)
        continue
      }
      flush()
      const r = runSceneCommand(c)
      anyOk ||= r.ok
      messages.push(r.message)
    }
    flush()
  })
  const skipped = batch.skipped.length ? ` I didn't understand ${joinList(batch.skipped.map((s) => `"${s}"`))}.` : ''
  const head = batch.summary && anyOk ? `Built ${article(batch.summary)}: ` : ''
  return { ok: anyOk, message: `${head}${messages.join('. ')}.${skipped}`.replace(/\.\./g, '.') }
}

/** Short plan for a command, shown while the person is still talking: "3 streetlights · road · 2 houses · 3 people". */
export function previewCommand(command: VoiceCommand): string | null {
  const parts = (command.type === 'BATCH' ? command.commands : [command]).map((c) => {
    if (c.type === 'SPAWN_OBJECTS' || c.type === 'SPAWN_ACTORS') return c.count === 1 ? c.label : `${c.count} ${plural(c.label)}`
    if (c.type === 'EDIT_OBJECTS' || c.type === 'SIZE_OBJECTS') return `change ${c.target.label ? plural(singular(c.target.label)) : 'it'}`
    if (c.type === 'DELETE_OBJECTS') return `remove ${c.target.label ? plural(singular(c.target.label)) : 'it'}`
    if (c.type === 'ACTOR_BEHAVIOUR') return `${c.behaviour} ${c.target.label ?? 'them'}`
    if (c.type === 'MOVE_OBJECTS') return 'move'
    if (c.type === 'ROTATE_OBJECTS') return 'rotate'
    if (c.type === 'RESIZE_OBJECTS') return 'resize'
    if (c.type === 'DUPLICATE_OBJECTS') return 'copy'
    return null
  })
  if (parts.some((p) => p === null) || !parts.length) return null
  return `${command.type === 'BATCH' && command.summary ? `${command.summary}: ` : ''}${parts.join(' · ')}`
}
