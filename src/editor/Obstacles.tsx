import type { ThreeEvent } from '@react-three/fiber'
import { clampToWorld, useWorld } from '../world/store'
import type { Vec2, WorldObject } from '../world/types'
import { snapAngle, snapFootprint, snapSize } from '../world/snap'
import { cycleVariant } from '../world/catalog'
import { groundPoint } from '../scene/worldRoot'
import { SelectionOutline, Structure } from '../scene/structures'
import { beginDrag } from './drag'
import { useEditor } from './settings'

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

/** Editor actions shared by the keyboard, the HUD and the in-scene buttons. */
export function duplicateSelected() {
  const w = useWorld.getState()
  if (w.selectedId) w.duplicateObject(w.selectedId)
}
export function deleteSelected() {
  const w = useWorld.getState()
  if (w.selectedId) w.removeObject(w.selectedId)
}
export function cycleSelected() {
  const w = useWorld.getState()
  const o = w.selectedId ? w.objects[w.selectedId] : null
  const patch = o && cycleVariant(o)
  if (o && patch) w.updateObject(o.id, patch)
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
      move: (p) => {
        const cur = useWorld.getState().objects[o.id] ?? o
        let at: Vec2 = [p[0] + offset[0], p[1] + offset[1]]
        if (useEditor.getState().snap) at = snapFootprint(at, cur.size[0], cur.size[2], cur.rotationY)
        updateObject(o.id, { position: [clampToWorld(at[0]), o.position[1], clampToWorld(at[1])] })
      },
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
        const snap = useEditor.getState().snap
        const nw = snap ? snapSize(lx) : Math.max(MIN_SIZE, lx)
        const nd = snap ? snapSize(lz) : Math.max(MIN_SIZE, lz)
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
        const a = Math.atan2(-dx, -dz)
        useWorld.getState().updateObject(o.id, { rotationY: useEditor.getState().snap ? snapAngle(a) : a })
      },
    })
  }

  // One-shot buttons: a press is the whole action (works the same for mouse, rays and hands).
  const press = (action: () => void) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    action()
  }

  // Buttons spread out a little on small objects so they stay easy to hit.
  const bx = Math.max(w / 2, 0.7)
  const bz = Math.max(d / 2, 0.7)
  const top = h + 0.35
  return (
    <group position={o.position} rotation={[0, o.rotationY, 0]}>
      <group onPointerDown={onDown}>
        <Structure o={o} />
      </group>
      {selected && (
        <>
          <SelectionOutline size={o.size} />
          <Handle position={[w / 2, top, d / 2]} color="#ffd166" onPointerDown={onResizeDown} />
          <Handle position={[0, top, -d / 2 - 0.8]} color="#7bdff2" onPointerDown={onRotateDown} />
          <Button position={[-bx, top, bz]} color="#06d6a0" onPointerDown={press(duplicateSelected)} />
          <Button position={[-bx, top, -bz]} color="#b388eb" onPointerDown={press(cycleSelected)} />
          <Button position={[bx, top, -bz]} color="#ef476f" onPointerDown={press(deleteSelected)} />
        </>
      )}
    </group>
  )
}

type HandleProps = { position: [number, number, number]; color: string; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }

/** Drag handle (sphere). */
function Handle(props: HandleProps) {
  return (
    <mesh position={props.position} onPointerDown={props.onPointerDown}>
      <sphereGeometry args={[0.35, 16, 12]} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.4} />
    </mesh>
  )
}

/** Press button (cube), so it reads differently from the drag handles. */
function Button(props: HandleProps) {
  return (
    <mesh position={props.position} rotation={[0, Math.PI / 4, 0]} onPointerDown={props.onPointerDown}>
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.5} />
    </mesh>
  )
}
