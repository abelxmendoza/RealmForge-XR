import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BUILDING_DEFAULTS, WALL_DEFAULTS, clampToWorld, useWorld } from '../world/store'
import { WORLD, type Vec2 } from '../world/types'
import { groundPoint } from '../scene/worldRoot'
import { beginDrag } from './drag'

const MIN_WALL = 0.6

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

/** The map's ground. Clicking it applies the current tool. */
export function Ground() {
  const tool = useWorld((s) => s.tool)
  const [draft, setDraft] = useState<[Vec2, Vec2] | null>(null)
  const size = WORLD.half * 2

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const p = groundPoint(e)
    if (!p) return
    const at: Vec2 = [clampToWorld(p[0]), clampToWorld(p[1])]
    const w = useWorld.getState()
    switch (tool) {
      case 'select':
        w.select(null)
        return
      case 'goal':
        e.stopPropagation()
        w.setGoal(at)
        return
      case 'robot':
        e.stopPropagation()
        w.placeRobot(at)
        return
      case 'building': {
        e.stopPropagation()
        const id = w.addObject({ kind: 'building', position: [at[0], 0, at[1]], size: [...BUILDING_DEFAULTS.size], rotationY: 0, color: BUILDING_DEFAULTS.color })
        w.select(id)
        return
      }
      case 'wall': {
        let seg: [Vec2, Vec2] = [at, at]
        setDraft(seg)
        beginDrag(e, {
          move: (q) => {
            seg = [at, [clampToWorld(q[0]), clampToWorld(q[1])]]
            setDraft(seg)
          },
          end: () => {
            setDraft(null)
            const wall = wallFromSegment(seg[0], seg[1])
            if (wall.size[0] < MIN_WALL) return
            const id = useWorld.getState().addObject({ kind: 'wall', ...wall, color: WALL_DEFAULTS.color })
            useWorld.getState().select(id)
          },
        })
      }
    }
  }

  const preview = draft && wallFromSegment(draft[0], draft[1])
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={onDown}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#3b4a3f" />
      </mesh>
      <gridHelper args={[size, size / WORLD.cell, '#56705d', '#46594b']} position={[0, 0.01, 0]} />
      {/* Table edge so the miniature reads as an object in passthrough. */}
      <mesh position={[0, -0.4, 0]}>
        <boxGeometry args={[size + 0.6, 0.8, size + 0.6]} />
        <meshStandardMaterial color="#2a2f36" />
      </mesh>
      {preview && preview.size[0] > 0.05 && (
        <mesh position={[preview.position[0], WALL_DEFAULTS.height / 2, preview.position[2]]} rotation={[0, preview.rotationY, 0]}>
          <boxGeometry args={preview.size} />
          <meshStandardMaterial color={WALL_DEFAULTS.color} transparent opacity={0.5} />
        </mesh>
      )}
    </>
  )
}
