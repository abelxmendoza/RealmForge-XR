import { create } from 'zustand'
import { WORLD, type ObjectKind, type Vec2, type Vec3, type WorldObject } from './types'

export type Tool = 'select' | 'wall' | 'building' | 'platform' | 'decor' | 'goal' | 'robot' | 'asset'

/** A whole world: what presets provide and loadWorld() installs. */
export interface WorldSnapshot {
  objects: WorldObject[]
  robotStart: Vec2
  goal: Vec2 | null
}

export interface WorldState {
  objects: Record<string, WorldObject>
  robotStart: Vec2
  goal: Vec2 | null
  /** Bumped on every change to obstacle geometry. Navigation replans when it changes. */
  geometryVersion: number
  /** Bumped when the robot is teleported (placed). */
  robotVersion: number

  // Editor UI state (shared by desktop and XR input).
  tool: Tool
  selectedId: string | null
  dragging: boolean

  addObject: (o: Omit<WorldObject, 'id'> & { id?: string }) => string
  updateObject: (id: string, patch: Partial<Omit<WorldObject, 'id'>>) => void
  removeObject: (id: string) => void
  /** Copy an object next to the original and select the copy. Returns the new id. */
  duplicateObject: (id: string) => string | null
  /** Replace the whole world (objects, robot, goal). Always teleports the robot to robotStart. Callers confirm with the user first. */
  loadWorld: (w: WorldSnapshot) => void
  /**
   * Restore a snapshot for undo/redo. Bumps geometryVersion so navigation rebuilds;
   * only bumps robotVersion (and teleports the live robot) when robotStart actually changed.
   * Preserves selection when the selected id still exists in the snapshot.
   */
  restoreWorld: (w: WorldSnapshot) => void
  setGoal: (p: Vec2 | null) => void
  placeRobot: (p: Vec2) => void
  setTool: (t: Tool) => void
  select: (id: string | null) => void
  setDragging: (d: boolean) => void
  reset: () => void
}

let nextId = 1
export const newId = (prefix = 'obj') => `${prefix}-${nextId++}`
/** Keep newId() ahead of ids that came from outside (loaded or imported worlds), so they never collide. */
export function reserveIds(ids: Iterable<string>) {
  for (const id of ids) {
    const m = /-(\d+)$/.exec(id)
    if (m) nextId = Math.max(nextId, Number(m[1]) + 1)
  }
}
const ID_PREFIX: Record<ObjectKind, string> = { wall: 'wall', building: 'bld', platform: 'plat', tree: 'tree', streetlight: 'lamp', crate: 'crate' }
export const idFor = (kind: ObjectKind) => newId(ID_PREFIX[kind] ?? 'obj')

const sameVec2 = (a: Vec2, b: Vec2) => a[0] === b[0] && a[1] === b[1]

/** Defaults in map metres (1 unit = 1 m). Presentation scale never changes these. */
export const WALL_DEFAULTS = { height: 3, thickness: 0.3, color: '#c9b79c' }
export const BUILDING_DEFAULTS: { size: Vec3; color: string } = { size: [12, 12, 12], color: '#8fa6c9' }

export const clampToWorld = (v: number, margin = 0) =>
  Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, v))

function initialObjects(): Record<string, WorldObject> {
  const list: WorldObject[] = [
    { id: newId('bld'), kind: 'building', position: [-12, 0, -8], size: [12, 12, 12], rotationY: 0, color: BUILDING_DEFAULTS.color },
    { id: newId('bld'), kind: 'building', position: [16, 0, 12], size: [10, 9, 16], rotationY: 0.3, color: '#a9c98f' },
    { id: newId('wall'), kind: 'wall', position: [8, 0, -16], size: [24, WALL_DEFAULTS.height, WALL_DEFAULTS.thickness], rotationY: 0, color: WALL_DEFAULTS.color },
  ]
  return Object.fromEntries(list.map((o) => [o.id, o]))
}

const initial = () => ({
  objects: initialObjects(),
  robotStart: [-32, 28] as Vec2,
  goal: [32, -28] as Vec2,
})

export const useWorld = create<WorldState>((set) => ({
  ...initial(),
  geometryVersion: 0,
  robotVersion: 0,
  tool: 'select',
  selectedId: null,
  dragging: false,

  addObject: (o) => {
    const id = o.id ?? idFor(o.kind)
    set((s) => ({ objects: { ...s.objects, [id]: { ...o, id } }, geometryVersion: s.geometryVersion + 1 }))
    return id
  },
  updateObject: (id, patch) =>
    set((s) => {
      const cur = s.objects[id]
      if (!cur) return s
      return { objects: { ...s.objects, [id]: { ...cur, ...patch } }, geometryVersion: s.geometryVersion + 1 }
    }),
  removeObject: (id) =>
    set((s) => {
      const { [id]: _removed, ...rest } = s.objects
      return { objects: rest, selectedId: s.selectedId === id ? null : s.selectedId, geometryVersion: s.geometryVersion + 1 }
    }),
  duplicateObject: (id) => {
    const src = useWorld.getState().objects[id]
    if (!src) return null
    // Offset diagonally by about half a footprint, flipping direction near the map edge.
    const step = Math.max(1, Math.round(Math.min(src.size[0], src.size[2]) * 0.5 + 0.5))
    const margin = Math.hypot(src.size[0], src.size[2]) / 2
    const shift = (v: number) => {
      const out = v + step > WORLD.half - margin ? v - step : v + step
      return clampToWorld(out, Math.min(margin, WORLD.half))
    }
    const copy: WorldObject = {
      ...src,
      id: idFor(src.kind),
      position: [shift(src.position[0]), src.position[1], shift(src.position[2])],
      size: [...src.size],
    }
    set((s) => ({ objects: { ...s.objects, [copy.id]: copy }, selectedId: copy.id, geometryVersion: s.geometryVersion + 1 }))
    return copy.id
  },
  loadWorld: (w) => {
    reserveIds(w.objects.map((o) => o.id))
    set((s) => ({
      objects: Object.fromEntries(w.objects.map((o) => [o.id, { ...o }])),
      robotStart: [...w.robotStart] as Vec2,
      goal: w.goal ? ([...w.goal] as Vec2) : null,
      selectedId: null,
      geometryVersion: s.geometryVersion + 1,
      robotVersion: s.robotVersion + 1,
    }))
  },
  restoreWorld: (w) => {
    reserveIds(w.objects.map((o) => o.id))
    set((s) => {
      const robotChanged = !sameVec2(s.robotStart, w.robotStart)
      return {
        objects: Object.fromEntries(w.objects.map((o) => [o.id, { ...o }])),
        robotStart: [...w.robotStart] as Vec2,
        goal: w.goal ? ([...w.goal] as Vec2) : null,
        selectedId: s.selectedId && w.objects.some((o) => o.id === s.selectedId) ? s.selectedId : null,
        geometryVersion: s.geometryVersion + 1,
        ...(robotChanged ? { robotVersion: s.robotVersion + 1 } : {}),
      }
    })
  },
  setGoal: (p) => set({ goal: p }),
  placeRobot: (p) => set((s) => ({ robotStart: p, robotVersion: s.robotVersion + 1 })),
  setTool: (tool) => set({ tool }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (dragging) => set({ dragging }),
  reset: () =>
    set((s) => ({ ...initial(), selectedId: null, geometryVersion: s.geometryVersion + 1, robotVersion: s.robotVersion + 1 })),
}))
