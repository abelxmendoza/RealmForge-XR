import { create } from 'zustand'
import { WORLD, type Vec2, type Vec3, type WorldObject } from './types'

export type Tool = 'select' | 'wall' | 'building' | 'goal' | 'robot'

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
  setGoal: (p: Vec2 | null) => void
  placeRobot: (p: Vec2) => void
  setTool: (t: Tool) => void
  select: (id: string | null) => void
  setDragging: (d: boolean) => void
  reset: () => void
}

let nextId = 1
export const newId = (prefix = 'obj') => `${prefix}-${nextId++}`

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
    const id = o.id ?? newId(o.kind === 'wall' ? 'wall' : 'bld')
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
  setGoal: (p) => set({ goal: p }),
  placeRobot: (p) => set((s) => ({ robotStart: p, robotVersion: s.robotVersion + 1 })),
  setTool: (tool) => set({ tool }),
  select: (selectedId) => set({ selectedId }),
  setDragging: (dragging) => set({ dragging }),
  reset: () =>
    set((s) => ({ ...initial(), selectedId: null, geometryVersion: s.geometryVersion + 1, robotVersion: s.robotVersion + 1 })),
}))
