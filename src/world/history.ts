import { useWorld, type WorldSnapshot } from './store'

/**
 * Undo / redo for world data (objects, robot start, goal).
 * Mid-drag updates coalesce into one step. Loads/imports clear the stacks.
 * Dirty tracking lives in persistence.ts (fingerprint subscribe).
 */

const MAX = 50
const undoStack: WorldSnapshot[] = []
const redoStack: WorldSnapshot[] = []

let suppress = false
/** Snapshot captured when a drag begins; committed as one undo step on drag end if the world changed. */
let beforeDrag: WorldSnapshot | null = null
let dragStartGeometry = 0
let dragStartRobot = 0
let listening = false

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
}

type Listener = (s: HistoryState) => void
const listeners = new Set<Listener>()

function snapshotOf(s: {
  objects: ReturnType<typeof useWorld.getState>['objects']
  robotStart: ReturnType<typeof useWorld.getState>['robotStart']
  goal: ReturnType<typeof useWorld.getState>['goal']
}): WorldSnapshot {
  return {
    objects: Object.values(s.objects).map((o) => ({
      ...o,
      position: [...o.position] as [number, number, number],
      size: [...o.size] as [number, number, number],
    })),
    robotStart: [...s.robotStart] as [number, number],
    goal: s.goal ? ([...s.goal] as [number, number]) : null,
  }
}

function publish() {
  const state = getHistoryState()
  for (const l of listeners) l(state)
}

export function getHistoryState(): HistoryState {
  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoDepth: undoStack.length,
    redoDepth: redoStack.length,
  }
}

export function subscribeHistory(listener: Listener): () => void {
  listeners.add(listener)
  listener(getHistoryState())
  return () => {
    listeners.delete(listener)
  }
}

function pushUndo(before: WorldSnapshot) {
  undoStack.push(before)
  if (undoStack.length > MAX) undoStack.shift()
  redoStack.length = 0
  publish()
}

/** Call around loadWorld / import / replace so those don't create undo noise. */
export function withHistorySuppressed<T>(fn: () => T): T {
  suppress = true
  try {
    return fn()
  } finally {
    suppress = false
  }
}

/** Clear stacks after a full world replace (load / import / reset-from-file). */
export function clearHistory() {
  undoStack.length = 0
  redoStack.length = 0
  beforeDrag = null
  publish()
}

export function undo(): boolean {
  const prev = undoStack.pop()
  if (!prev) return false
  redoStack.push(snapshotOf(useWorld.getState()))
  withHistorySuppressed(() => useWorld.getState().loadWorld(prev))
  publish()
  return true
}

export function redo(): boolean {
  const next = redoStack.pop()
  if (!next) return false
  undoStack.push(snapshotOf(useWorld.getState()))
  withHistorySuppressed(() => useWorld.getState().loadWorld(next))
  publish()
  return true
}

function sameVec2(a: [number, number] | null, b: [number, number] | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a[0] === b[0] && a[1] === b[1]
}

/** Start listening to the world store. Safe to call once from app boot. */
export function installHistory(): () => void {
  if (listening) return () => undefined
  listening = true
  const unsub = useWorld.subscribe((state, prev) => {
    if (suppress) return

    // Drag start: remember the world before the gesture.
    if (state.dragging && !prev.dragging) {
      beforeDrag = snapshotOf(prev)
      dragStartGeometry = prev.geometryVersion
      dragStartRobot = prev.robotVersion
      return
    }

    // Drag end: one undo step for the whole gesture if anything moved.
    if (!state.dragging && prev.dragging) {
      if (
        beforeDrag &&
        (state.geometryVersion !== dragStartGeometry ||
          state.robotVersion !== dragStartRobot ||
          !sameVec2(state.goal, beforeDrag.goal))
      ) {
        pushUndo(beforeDrag)
      }
      beforeDrag = null
      return
    }

    if (state.dragging) return

    const changed =
      state.geometryVersion !== prev.geometryVersion ||
      state.robotVersion !== prev.robotVersion ||
      state.goal !== prev.goal
    if (changed) pushUndo(snapshotOf(prev))
  })
  return () => {
    unsub()
    listening = false
  }
}
