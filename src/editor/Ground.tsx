import { useState } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { Handle as GrabHandle } from '@react-three/handle'
import { WALL_DEFAULTS, clampToWorld, useWorld } from '../world/store'
import { WORLD, type Vec2, type Vec3, type WorldObject } from '../world/types'
import { BUILDING_STYLES, DECOR_DEFAULTS, PLATFORM_DEFAULTS } from '../world/catalog'
import { SNAP, snapFootprint, snapPoint } from '../world/snap'
import { SCALE_PRESETS, WORLD_ROOT, groundPoint, onTable, worldRootRef } from '../scene/worldRoot'
import { groundMaterial } from '../scene/materials'
import { tiledPlane, useGeometry } from '../scene/geometry'
import { Structure } from '../scene/structures'
import { beginDrag } from './drag'
import { useEditor } from './settings'

const MIN_WALL = 0.6
const MIN_PLATFORM = 0.5

/** Wall footprint from a drawn segment a→b. */
export function wallFromSegment(a: Vec2, b: Vec2) {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  return {
    position: [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2] as [number, number, number],
    size: [Math.hypot(dx, dz), WALL_DEFAULTS.height, WALL_DEFAULTS.thickness] as [number, number, number],
    // Local +x maps to (cos θ, −sin θ), so θ = atan2(−dz, dx).
    rotationY: Math.atan2(-dz, dx),
  }
}

/** Axis-aligned platform footprint spanning two dragged corners. */
export function platformFromCorners(a: Vec2, b: Vec2, height = PLATFORM_DEFAULTS.size[1]) {
  return {
    position: [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2] as Vec3,
    size: [Math.abs(b[0] - a[0]), height, Math.abs(b[1] - a[1])] as Vec3,
    rotationY: 0,
  }
}

/** Ground point → clamped to the map, and snapped to the grid when snapping is on. */
function placePoint(p: Vec2): Vec2 {
  const q = useEditor.getState().snap ? snapPoint(p) : p
  return [clampToWorld(q[0]), clampToWorld(q[1])]
}

/** The object a click with the building/decor tool would create at `at`. */
function objectForTool(tool: 'building' | 'decor', at: Vec2): Omit<WorldObject, 'id'> {
  const s = useEditor.getState()
  if (tool === 'building') {
    const def = BUILDING_STYLES[s.buildingStyle]
    const c = s.snap ? snapFootprint(at, def.size[0], def.size[2], 0) : at
    return { kind: 'building', position: [clampToWorld(c[0]), 0, clampToWorld(c[1])], size: [...def.size], rotationY: 0, color: def.color, style: s.buildingStyle, roof: s.roof }
  }
  const size: Vec3 = [...DECOR_DEFAULTS[s.decor].size]
  const extra = s.decor === 'tree' ? { style: s.treeStyle } : {}
  return { kind: s.decor, position: [at[0], 0, at[1]], size, rotationY: 0, ...extra }
}

type Draft = { kind: 'wall' | 'platform'; a: Vec2; b: Vec2 }

/** The map's ground. Clicking it applies the current tool. */
export function Ground() {
  const tool = useWorld((s) => s.tool)
  const [draft, setDraft] = useState<Draft | null>(null)
  const size = WORLD.half * 2

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const p = groundPoint(e)
    if (!p) return
    const raw: Vec2 = [clampToWorld(p[0]), clampToWorld(p[1])]
    const w = useWorld.getState()
    switch (tool) {
      case 'select':
        w.select(null)
        return
      case 'goal':
        e.stopPropagation()
        w.setGoal(raw)
        return
      case 'robot':
        e.stopPropagation()
        w.placeRobot(raw)
        return
      case 'building':
      case 'decor': {
        e.stopPropagation()
        const id = w.addObject(objectForTool(tool, placePoint(raw)))
        w.select(id)
        return
      }
      case 'wall':
      case 'platform': {
        const kind = tool
        const at = placePoint(raw)
        let cur: Draft = { kind, a: at, b: at }
        setDraft(cur)
        beginDrag(e, {
          move: (q) => {
            cur = { kind, a: at, b: placePoint(q) }
            setDraft(cur)
          },
          end: () => {
            setDraft(null)
            const s = useEditor.getState()
            const store = useWorld.getState()
            let id: string
            if (kind === 'wall') {
              const wall = wallFromSegment(cur.a, cur.b)
              if (wall.size[0] < MIN_WALL) return
              id = store.addObject({ kind: 'wall', ...wall, color: WALL_DEFAULTS.color, material: s.wallMaterial })
            } else {
              const plat = platformFromCorners(cur.a, cur.b)
              if (plat.size[0] < MIN_PLATFORM || plat.size[2] < MIN_PLATFORM) return
              id = store.addObject({ kind: 'platform', ...plat, material: s.platformMaterial })
            }
            store.select(id)
          },
        })
      }
    }
  }

  return (
    <>
      <Board size={size} onPointerDown={onDown} />
      {draft && <DraftPreview draft={draft} />}
    </>
  )
}

/** Translucent preview of the wall or platform being drawn. */
function DraftPreview({ draft }: { draft: Draft }) {
  const { wallMaterial, platformMaterial } = useEditor()
  const o: WorldObject =
    draft.kind === 'wall'
      ? { id: 'draft', kind: 'wall', ...wallFromSegment(draft.a, draft.b), material: wallMaterial }
      : { id: 'draft', kind: 'platform', ...platformFromCorners(draft.a, draft.b), material: platformMaterial }
  if (o.size[0] < 0.05 || o.size[2] < 0.05) return null
  return (
    <group position={o.position} rotation={[0, o.rotationY, 0]} raycast={() => null}>
      <Structure o={o} />
    </group>
  )
}

/** Real surface: an invisible ground that only shows shadows, so objects stay grounded on your actual floor. */
const SHADOW_GROUND = new THREE.ShadowMaterial({ opacity: 0.35, depthWrite: false })

/**
 * The board. Two surfaces (editor setting `surface`):
 * - virtual: textured placeholder ground with a faint construction grid
 * - real: transparent grid over your actual floor or table (passthrough shows through), with shadows,
 *   the map boundary and a 1 m origin cross, so true metres stay readable while you walk around
 * Either way the ground plane keeps its pointer handler, so pokes and rays still place things.
 * When the world sits on a table there is also a bevelled table edge. Edge sizes are real centimetres
 * at any tabletop scale (divided by the world ratio), so the rim stays grabbable; on the floor
 * (room scale and up) there is no table.
 */
function Board({ size, onPointerDown }: { size: number; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const ground = useGeometry(() => tiledPlane(size, size, 2), [size])
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio
  const real = useEditor((s) => s.surface === 'real')
  const table = onTable(ratio)
  const cm = (v: number) => v / 100 / ratio
  const fine = real ? { color: '#ffffff', opacity: 0.25 } : { color: '#ffffff', opacity: 0.07 }
  const major = real ? { color: '#7bdff2', opacity: 0.55 } : { color: '#e8f4ff', opacity: 0.18 }
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={ground} material={real ? SHADOW_GROUND : groundMaterial()} receiveShadow onPointerDown={onPointerDown} />
      {/* Fine grid at the snapping step (only once it's big enough to read), major lines every 5 m. */}
      {ratio >= SCALE_PRESETS.room.ratio && (
        <gridHelper args={[size, size / SNAP, fine.color, fine.color]} position={[0, 0.006, 0]} material-transparent material-opacity={fine.opacity} material-depthWrite={false} raycast={() => null} />
      )}
      <gridHelper args={[size, size / 5, major.color, major.color]} position={[0, 0.008, 0]} material-transparent material-opacity={major.opacity} material-depthWrite={false} raycast={() => null} />
      {real && <RealSurfaceMarks half={size / 2} />}
      {table && <TableEdge size={size} cm={cm} />}
    </>
  )
}

/** Map boundary (where editing ends) and a 1 m cross at the origin as a true-size reference. */
function RealSurfaceMarks({ half }: { half: number }) {
  const y = 0.012
  const edge: [number, number, number][] = [
    [-half, y, -half],
    [half, y, -half],
    [half, y, half],
    [-half, y, half],
    [-half, y, -half],
  ]
  return (
    <group>
      <Line points={edge} color="#f4a261" lineWidth={3} transparent opacity={0.9} depthWrite={false} raycast={() => null} />
      <Line points={[[-0.5, y, 0], [0.5, y, 0]]} color="#ffffff" lineWidth={2} depthWrite={false} raycast={() => null} />
      <Line points={[[0, y, -0.5], [0, y, 0.5]]} color="#ffffff" lineWidth={2} depthWrite={false} raycast={() => null} />
    </group>
  )
}

const RIM_MAT = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.7 })
const BASE_MAT = new THREE.MeshStandardMaterial({ color: '#2c2f36', roughness: 0.6 })

/**
 * Table edge so the miniature reads as an object in passthrough; its dark base is the map's grab handle.
 * Built as a frame around the board (not a slab under it), so with the real surface your actual table
 * shows through the middle.
 */
function TableEdge({ size, cm }: { size: number; cm: (v: number) => number }) {
  return (
    <>
      {/* Top sits 1 mm below the ground plane: coplanar faces z-fight. */}
      <Frame inner={size} outer={size + cm(3)} y={-cm(0.1) - cm(0.6)} height={cm(1.2)} material={RIM_MAT} />
      {/*
        The dark base is the map's grab handle in XR: grab its rim with one hand to move the whole map
        (up, down, closer), or with both hands to turn it. Grab pointers only, so desktop is unaffected.
      */}
      <GrabHandle
        targetRef={worldRootRef}
        filter={(e) => e.pointerType === 'grab'}
        rotate="y"
        scale={false}
        apply={(state, target) => {
          target.position.copy(state.current.position)
          target.quaternion.copy(state.current.quaternion)
          // Keep the shared default in sync so a re-render of <Scene> can't snap the map back.
          WORLD_ROOT.position.copy(state.current.position)
        }}
      >
        <Frame inner={size} outer={size + cm(6)} y={-cm(1.4) - cm(2.5)} height={cm(5)} material={BASE_MAT} raycastable />
      </GrabHandle>
    </>
  )
}

/** A square frame of four bars between `inner` and `outer` widths, centred at height `y`. */
function Frame(props: { inner: number; outer: number; y: number; height: number; material: THREE.Material; raycastable?: boolean }) {
  const { inner, outer, y, height, material } = props
  const band = (outer - inner) / 2
  const off = inner / 2 + band / 2
  const bars: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, y, -off], size: [outer, height, band] },
    { pos: [0, y, off], size: [outer, height, band] },
    { pos: [-off, y, 0], size: [band, height, inner] },
    { pos: [off, y, 0], size: [band, height, inner] },
  ]
  return (
    <>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} material={material} receiveShadow raycast={props.raycastable ? undefined : () => null}>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </>
  )
}
