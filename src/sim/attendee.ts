/**
 * Single-attendee event simulation MVP.
 * Reuses A* / grid from nav/ — does not replace robot navigation.
 */

import { create } from 'zustand'
import { planPath } from '../nav/astar'
import { type SimulationRole, type Vec2, type WorldObject } from '../world/types'
import { useWorld } from '../world/store'
import { useFlow } from '../flow/store'
import { buildFlowGrid } from '../flow/validate'

export type AttendeePhase =
  | 'idle'
  | 'walking'
  | 'serving'
  | 'done'
  | 'blocked'
  | 'no-path'

export type AttendeeStatus = {
  phase: AttendeePhase
  /** Human-readable current task. */
  task: string
  /** Index into itinerary. */
  stepIndex: number
  destinationId: string | null
  destinationLabel: string | null
  replanCount: number
  running: boolean
  paused: boolean
}

export type AttendeeRuntime = {
  pos: Vec2
  heading: number
  path: Vec2[]
  target: number
  serveUntil: number
}

/**
 * Itinerary from what the world contains: in at the entrance, through check-in (registration desk,
 * ticket gate or time clock), up to two booths or stalls, the stage, one service point (bar, machine,
 * toilets), then out. Roles the world doesn't have are skipped instead of stalling the walk.
 */
export function buildItinerary(objects: Iterable<WorldObject>): SimulationRole[] {
  const count: Partial<Record<SimulationRole, number>> = {}
  for (const o of objects) if (o.simulationRole) count[o.simulationRole] = (count[o.simulationRole] ?? 0) + 1
  const out: SimulationRole[] = ['entrance']
  if (count.registration) out.push('registration')
  for (let i = 0; i < Math.min(2, count.booth ?? 0); i++) out.push('booth')
  if (count.stage) out.push('stage')
  if (count.service) out.push('service')
  out.push('exit')
  return out
}

let runtime: AttendeeRuntime = {
  pos: [0, 0],
  heading: 0,
  path: [],
  target: 1,
  serveUntil: 0,
}

export const useAttendee = create<AttendeeStatus>(() => ({
  phase: 'idle',
  task: 'Idle',
  stepIndex: 0,
  destinationId: null,
  destinationLabel: null,
  replanCount: 0,
  running: false,
  paused: false,
}))

export function getAttendeeRuntime(): AttendeeRuntime {
  return runtime
}

function labelFor(o: WorldObject): string {
  if (o.catalogId) return o.catalogId.replace(/-/g, ' ')
  return o.simulationRole ?? o.kind
}

function objectsWithRole(role: SimulationRole): WorldObject[] {
  return Object.values(useWorld.getState().objects).filter((o) => o.simulationRole === role)
}

/** Pick the next destination for an itinerary role (round-robin booths by step). */
function pickDestination(role: SimulationRole, boothVisit: number): WorldObject | null {
  const list = objectsWithRole(role)
  if (!list.length) return null
  if (role === 'booth') return list[boothVisit % list.length] ?? null
  return list[0] ?? null
}

function footprintGoal(o: WorldObject): Vec2 {
  // Approach from the +z side of the object (local) projected to world — simple stand-off.
  const standoff = Math.max(0.8, o.size[2] / 2 + 0.6)
  const yaw = o.rotationY
  const dx = Math.sin(yaw) * standoff
  const dz = Math.cos(yaw) * standoff
  return [o.position[0] + dx, o.position[2] + dz]
}

function planTo(goal: Vec2): Vec2[] | null {
  // Attendees keep out of no-go / restricted traffic zones (backstage, robot cells) as well as solid props.
  const grid = buildFlowGrid(useWorld.getState().objects, Object.values(useFlow.getState().trafficZones))
  return planPath(grid, runtime.pos, goal)
}

let itinerary: SimulationRole[] = ['entrance', 'exit']
let boothVisits = 0
let unsubWorld: (() => void) | null = null
let unsubFlow: (() => void) | null = null
let running = false
let paused = false

function setStatus(patch: Partial<AttendeeStatus>) {
  useAttendee.setState(patch)
}

function advanceToStep(stepIndex: number) {
  if (stepIndex >= itinerary.length) {
    setStatus({
      phase: 'done',
      task: 'Finished tour',
      stepIndex,
      destinationId: null,
      destinationLabel: null,
    })
    runtime.path = []
    return
  }
  const role = itinerary[stepIndex]!
  let dest: WorldObject | null
  if (role === 'booth') {
    dest = pickDestination('booth', boothVisits)
    boothVisits++
  } else {
    dest = pickDestination(role, 0)
  }

  if (!dest) {
    setStatus({
      phase: 'blocked',
      task: `No ${role} destination in world`,
      stepIndex,
      destinationId: null,
      destinationLabel: null,
    })
    runtime.path = []
    return
  }

  const goal = footprintGoal(dest)
  const path = planTo(goal)
  if (!path || path.length < 1) {
    setStatus({
      phase: 'no-path',
      task: `No route to ${labelFor(dest)}`,
      stepIndex,
      destinationId: dest.id,
      destinationLabel: labelFor(dest),
    })
    runtime.path = []
    return
  }

  runtime.path = path
  runtime.target = 1
  setStatus({
    phase: 'walking',
    task: `Walking to ${labelFor(dest)}`,
    stepIndex,
    destinationId: dest.id,
    destinationLabel: labelFor(dest),
    replanCount: useAttendee.getState().replanCount,
  })
}

function replanCurrent() {
  const { phase, stepIndex, destinationId } = useAttendee.getState()
  if (!running || paused) return
  if (phase !== 'walking' && phase !== 'no-path' && phase !== 'blocked') return
  if (!destinationId) return
  const dest = useWorld.getState().objects[destinationId]
  if (!dest) {
    setStatus({ phase: 'blocked', task: 'Destination removed' })
    return
  }
  const path = planTo(footprintGoal(dest))
  const prev = useAttendee.getState().replanCount
  if (!path) {
    runtime.path = []
    setStatus({
      phase: 'no-path',
      task: `No route to ${labelFor(dest)}`,
      replanCount: prev + 1,
    })
    return
  }
  runtime.path = path
  runtime.target = 1
  setStatus({
    phase: 'walking',
    task: `Walking to ${labelFor(dest)}`,
    destinationLabel: labelFor(dest),
    replanCount: prev + 1,
  })
}

function ensureWorldWatch() {
  if (unsubWorld) return
  unsubWorld = useWorld.subscribe((s, prev) => {
    if (s.geometryVersion !== prev.geometryVersion) replanCurrent()
  })
  unsubFlow ??= useFlow.subscribe((s, prev) => {
    if (s.trafficZones !== prev.trafficZones) replanCurrent()
  })
}

export function startAttendeeSimulation(customItinerary?: SimulationRole[]) {
  ensureWorldWatch()
  itinerary = customItinerary?.length ? [...customItinerary] : buildItinerary(Object.values(useWorld.getState().objects))
  boothVisits = 0
  running = true
  paused = false

  const entrance = objectsWithRole('entrance')[0]
  const start: Vec2 = entrance
    ? [entrance.position[0], entrance.position[2]]
    : [...useWorld.getState().robotStart]

  runtime = {
    pos: [start[0], start[1]],
    heading: Math.PI, // face -z into the venue from south entrance
    path: [],
    target: 1,
    serveUntil: 0,
  }

  // Skip entrance role if we already spawned there — start at registration.
  const startStep = itinerary[0] === 'entrance' ? 1 : 0
  setStatus({
    phase: 'idle',
    task: 'Starting',
    stepIndex: startStep,
    destinationId: null,
    destinationLabel: null,
    replanCount: 0,
    running: true,
    paused: false,
  })
  advanceToStep(startStep)
}

export function pauseAttendeeSimulation() {
  if (!running) return
  paused = true
  const s = useAttendee.getState()
  if (s.phase === 'walking' || s.phase === 'serving') {
    setStatus({ paused: true, task: `Paused — ${s.task}` })
  } else {
    setStatus({ paused: true })
  }
}

export function resumeAttendeeSimulation() {
  if (!running) return
  paused = false
  const s = useAttendee.getState()
  if (s.phase === 'walking') setStatus({ paused: false, task: `Walking to ${s.destinationLabel ?? 'destination'}` })
  else if (s.phase === 'serving') setStatus({ paused: false, task: `At ${s.destinationLabel ?? 'destination'}` })
  else setStatus({ paused: false })
}

export function resetAttendeeSimulation() {
  running = false
  paused = false
  boothVisits = 0
  runtime = { pos: [0, 0], heading: 0, path: [], target: 1, serveUntil: 0 }
  setStatus({
    phase: 'idle',
    task: 'Idle',
    stepIndex: 0,
    destinationId: null,
    destinationLabel: null,
    replanCount: 0,
    running: false,
    paused: false,
  })
}

export function isAttendeeRunning() {
  return running
}

export function isAttendeePaused() {
  return paused
}

const SPEED = 1.8
const TURN = 7

/** Drive the attendee each frame. Call from a R3F useFrame. */
export function tickAttendee(dt: number, now = performance.now()) {
  if (!running || paused) return
  const status = useAttendee.getState()
  dt = Math.min(dt, 0.1)

  if (status.phase === 'serving') {
    if (now >= runtime.serveUntil) {
      advanceToStep(status.stepIndex + 1)
    }
    return
  }

  if (status.phase !== 'walking') return

  const { path } = runtime
  if (runtime.target >= path.length) {
    // Arrived
    const destId = status.destinationId
    const dest = destId ? useWorld.getState().objects[destId] : null
    const serve = dest?.serviceDuration ?? 1.2
    runtime.serveUntil = now + serve * 1000
    setStatus({
      phase: 'serving',
      task: `At ${status.destinationLabel ?? 'destination'}`,
    })
    return
  }

  let budget = SPEED * dt
  const pos = runtime.pos
  while (budget > 0 && runtime.target < path.length) {
    const [tx, tz] = path[runtime.target]!
    const dx = tx - pos[0]
    const dz = tz - pos[1]
    const dist = Math.hypot(dx, dz)
    if (dist > 1e-4) {
      const desired = Math.atan2(dx, dz)
      let diff = desired - runtime.heading
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      runtime.heading += diff * Math.min(1, TURN * dt)
    }
    if (dist <= budget) {
      pos[0] = tx
      pos[1] = tz
      budget -= dist
      runtime.target++
    } else {
      pos[0] += (dx / dist) * budget
      pos[1] += (dz / dist) * budget
      budget = 0
    }
  }
}

/** Destinations currently used by the active itinerary (for debug / tests). */
export function listSimulationDestinations(): { role: SimulationRole; id: string }[] {
  return Object.values(useWorld.getState().objects)
    .filter((o) => o.simulationRole && o.simulationRole !== 'decoration' && o.simulationRole !== 'obstacle')
    .map((o) => ({ role: o.simulationRole!, id: o.id }))
}
