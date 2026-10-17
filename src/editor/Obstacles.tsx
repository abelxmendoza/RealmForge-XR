import type { ThreeEvent } from '@react-three/fiber'
import { clampToWorld, useWorld } from '../world/store'
import type { Vec2, WorldObject } from '../world/types'
import { groundPoint } from '../scene/worldRoot'
import { beginDrag } from './drag'

const MIN_SIZE = 0.4

/** Map-local rotation helpers. three.js yaw θ maps local +x to (cos θ, −sin θ) on the ground. */
const toWorld = (o: WorldObject, lx: number, lz: number): Vec2 => {
  const c = Math.cos(o.rotationY)
  const s = Math.sin(o.rotationY)
  return [o.position[0] + c * lx + s * lz, o.position[2] - s * lx + c * lz]
}
const toLocal = (o: WorldObject, p: Vec2, from: Vec2 = [o.position[0], o.position[2]]): Vec2 => {
  const c = Math.cos(o.rotationY)
  const s = Math.sin(o.rotationY)
  const dx = p[0] - from[0]
  const dz = p[1] - from[1]
  return [c * dx - s * dz, s * dx + c * dz]
}

export function Obstacles() {
  const objects = useWorld((s) => s.objects)
  return (
    <>
      {Object.values(objects).map((o) => (
        <Obstacle key={o.id} o={o} />
      ))}
    </>
  )
}

function Obstacle({ o }: { o: WorldObject }) {
  const selected = useWorld((s) => s.selectedId === o.id)
  const tool = useWorld((s) => s.tool)
  const [w, h, d] = o.size

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'select') return
    const { select, updateObject } = useWorld.getState()
    select(o.id)
    const start = groundPoint(e)
    if (!start) return
    const offset: Vec2 = [o.position[0] - start[0], o.position[2] - start[1]]
    beginDrag(e, {
      move: (p) =>
        updateObject(o.id, {
          position: [clampToWorld(p[0] + offset[0]), o.position[1], clampToWorld(p[1] + offset[1])],
        }),
    })
  }

  const onResizeDown = (e: ThreeEvent<PointerEvent>) => {
    // Keep the opposite corner fixed and stretch toward the pointer, in the object's own frame.
    const fixed = toWorld(o, -w / 2, -d / 2)
    beginDrag(e, {
      move: (p) => {
        const cur = useWorld.getState().objects[o.id]
        if (!cur) return
        const [lx, lz] = toLocal(cur, p, fixed)
        const nw = Math.max(MIN_SIZE, lx)
        const nd = Math.max(MIN_SIZE, lz)
        const c = Math.cos(cur.rotationY)
        const s = Math.sin(cur.rotationY)
        const cx = fixed[0] + c * (nw / 2) + s * (nd / 2)
        const cz = fixed[1] - s * (nw / 2) + c * (nd / 2)
        useWorld.getState().updateObject(o.id, { size: [nw, cur.size[1], nd], position: [cx, cur.position[1], cz] })
      },
    })
  }

  const onRotateDown = (e: ThreeEvent<PointerEvent>) => {
    beginDrag(e, {
      move: (p) => {
        const cur = useWorld.getState().objects[o.id]
        if (!cur) return
        // Handle sits on local −z, i.e. world direction (−sin θ, −cos θ) → θ = atan2(−dx, −dz).
        const dx = p[0] - cur.position[0]
        const dz = p[1] - cur.position[2]
        if (Math.hypot(dx, dz) < 0.2) return
        useWorld.getState().updateObject(o.id, { rotationY: Math.atan2(-dx, -dz) })
      },
    })
  }

  const color = o.color ?? '#999'
  return (
    <group position={o.position} rotation={[0, o.rotationY, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow onPointerDown={onDown}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} emissive={selected ? '#ffb347' : '#000'} emissiveIntensity={selected ? 0.35 : 0} />
      </mesh>
      {selected && (
        <>
          <Handle position={[w / 2, h + 0.3, d / 2]} color="#ffd166" onPointerDown={onResizeDown} />
          <Handle position={[0, h + 0.3, -d / 2 - 0.8]} color="#7bdff2" onPointerDown={onRotateDown} />
        </>
      )}
    </group>
  )
}

function Handle(props: { position: [number, number, number]; color: string; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  return (
    <mesh position={props.position} onPointerDown={props.onPointerDown}>
      <sphereGeometry args={[0.35, 16, 12]} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.4} />
    </mesh>
  )
}
