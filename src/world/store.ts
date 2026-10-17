import { create } from 'zustand'
import { WORLD, type ObjectKind, type Vec2, type Vec3, type WorldObject } from './types'

export type Tool = 'select' | 'wall' | 'building' | 'platform' | 'decor' | 'event' | 'goal' | 'robot'

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
  /** Replace the whole world (objects, robot, goal). Callers confirm with the user first. */
  loadWorld: (w: WorldSnapshot) => void
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
const ID_PREFIX: Record<ObjectKind, string> = {
  wall: 'wall',
  building: 'bld',
  platform: 'plat',
  tree: 'tree',
  streetlight: 'lamp',
  crate: 'crate',
  prop: 'prop',
}
export const idFor = (kind: ObjectKind) => newId(ID_PREFIX[kind] ?? 'obj')

export const WALL_DEFAULTS = { height: 1.6, thickness: 0.5, color: '#c9b79c' }
export const BUILDING_DEFAULTS: { size: Vec3; color: string } = { size: [2, 3, 2], color: '#8fa6c9' }

export const clampToWorld = (v: number, margin = 0) =>
  Math.max(-WORLD.half + margin, Math.min(WORLD.half - margin, v))

function initialObjects(): Record<string, WorldObject> {
  const list: WorldObject[] = [
    { id: newId('bld'), kind: 'building', position: [-3, 0, -2], size: [3, 3.5, 3], rotationY: 0, color: BUILDING_DEFAULTS.color },
    { id: newId('bld'), kind: 'building', position: [4, 0, 3], size: [2.5, 2.5, 4], rotationY: 0.3, color: '#a9c98f' },
    { id: newId('wall'), kind: 'wall', position: [2, 0, -4], size: [6, WALL_DEFAULTS.height, WALL_DEFAULTS.thickness], rotationY: 0, color: WALL_DEFAULTS.color },
  ]
  return Object.fromEntries(list.map((o) => [o.id, o]))
}

const initial = () => ({
  objects: initialObjects(),
  robotStart: [-8, 7] as Vec2,
  goal: [8, -7] as Vec2,
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
      robotStart: [...w.robotStart],
      goal: w.goal ? [...w.goal] : null,
      selectedId: null,
      geometryVersion: s.geometryVersion + 1,
      robotVersion: s.robotVersion + 1,
    }))
  },
  setGoal: (p) => set({ goal: p }),
  placeRobot: (p) => set((s) => ({ robotStart: p, robotVersion: s.robotVersion + 1 })),
  setTool: (tool) => set({ tool }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (dragging) => set({ dragging }),
  reset: () =>
    set((s) => ({ ...initial(), selectedId: null, geometryVersion: s.geometryVersion + 1, robotVersion: s.robotVersion + 1 })),
}))
