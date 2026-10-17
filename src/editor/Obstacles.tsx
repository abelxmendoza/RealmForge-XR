import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Handle as GrabHandle, type HandleState } from '@react-three/handle'
import { clampToWorld, useWorld } from '../world/store'
import { blocksNavigation, type Vec2, type WorldObject } from '../world/types'
import { snapAngle, snapFootprint, snapSize } from '../world/snap'
import { cycleVariant } from '../world/catalog'
import { SCALE_PRESETS, groundPoint, uiSize } from '../scene/worldRoot'
import { SelectionOutline, Structure } from '../scene/structures'
import { beginDrag } from './drag'
import { applyGroundHover, applyGroundTool } from './Ground'
import { MIN_SIZE, grabPatch, samePatch, type GrabPatch } from './grab'
import { useEditor } from './settings'
import { HAPTIC, pulse } from '../xr/haptics'
import { clampToRoom, settleObject } from '../xr/realSurfaces'
import { groupIds, useSelection } from './selection'

/** What a hand grab remembers between frames: the object as grabbed, and the last patch sent. */
interface GrabMemo {
  base: WorldObject
  last?: GrabPatch
}

const yawOf = new THREE.Euler()

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
/** Duplicate the framed group (the copies become the new group), or the single selected object. */
export function duplicateSelected() {
  const w = useWorld.getState()
  const group = groupIds()
  if (group.length) {
    const copies = group.map((id) => w.duplicateObject(id)).filter((id): id is string => !!id)
    useSelection.getState().setGroup(copies)
    return
  }
  if (w.selectedId) w.duplicateObject(w.selectedId)
}
/** Delete the framed group, or the single selected object. */
export function deleteSelected() {
  const w = useWorld.getState()
  const group = groupIds()
  if (group.length) {
    for (const id of group) w.removeObject(id)
    useSelection.getState().clear()
    return
  }
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
  // Framed group members get their own outline; the live frame preview a lighter one.
  const inGroup = useSelection((s) => s.ids.includes(o.id))
  const inPreview = useSelection((s) => s.preview.includes(o.id))
  const [w, h, d] = o.size
  const groupRef = useRef<THREE.Group>(null)
  // Near-grab feedback: hover outline when a hand/controller can grab it; while held, the object follows the
  // hand freely (`free`) and a ghost shows the snapped pose it will commit to.
  const [hovered, setHovered] = useState(false)
  const [holding, setHolding] = useState(false)
  const free = useRef<{ x: number; z: number; yaw: number } | null>(null)
  useFrame(() => {
    const g = groupRef.current
    const f = free.current
    if (!g || !f) return
    g.position.x = f.x
    g.position.z = f.z
    g.rotation.y = f.yaw
  })
  const ratio = SCALE_PRESETS[useEditor((s) => s.worldScale)].ratio

  /**
   * Hand / controller-grip grab (XR grab pointers only; rays and the mouse use onDown below).
   * One hand moves the object on the map and wrist twist turns it; a second hand adds
   * two-hand rotate and uniform scale. The store is the source of truth, so the target is never mutated.
   */
  const onGrab = (state: HandleState<GrabMemo>): GrabMemo => {
    const world = useWorld.getState()
    const memo = state.memo ?? { base: world.objects[o.id] ?? o }
    if (state.first) {
      world.select(o.id)
      world.setDragging(true)
      setHolding(true)
      pulse('active', HAPTIC.grab)
    }
    const { position, quaternion, scale } = state.current
    const t = { x: position.x, z: position.z, rotationY: yawOf.setFromQuaternion(quaternion, 'YXZ').y, scale: scale.x }
    const snap = useEditor.getState().snap
    const patch = grabPatch(memo.base, t, snap)
    // Respect real surfaces: stop at real walls and furniture (no-op when off).
    const prev = memo.last?.position ?? memo.base.position
    patch.position = clampToRoom(memo.base, prev, patch.position, patch.size)
    // The store (and navigation) get the snapped pose; the object itself follows the hand until release.
    if (snap) {
      const loose = grabPatch(memo.base, t, false)
      const [lx, , lz] = clampToRoom(memo.base, prev, loose.position, loose.size)
      free.current = { x: lx, z: lz, yaw: loose.rotationY }
    } else free.current = null
    if (!samePatch(memo.last, patch)) {
      world.updateObject(o.id, patch)
      if (memo.last && snap) pulse('active', HAPTIC.tick) // feel each snap step
      memo.last = patch
    }
    if (state.last) {
      free.current = null
      setHolding(false)
      settleObject(o.id)
      world.setDragging(false)
    }
    return memo
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    // Read the tool at press time; a value captured at render can be stale right after switching.
    if (useWorld.getState().tool !== 'select') {
      // Walkable surfaces (slabs, roads, plazas) cover the ground: placement tools land on the ground below.
      if (!blocksNavigation(o)) applyGroundTool(e)
      return
    }
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

  // Handles and buttons keep a reachable real size at every world scale; they spread out a little
  // on small objects so they stay easy to hit.
  const r = uiSize(ratio, 0.02)
  const bx = Math.max(w / 2, 2 * r)
  const bz = Math.max(d / 2, 2 * r)
  const top = h + r
  return (
    <>
    <group ref={groupRef} position={o.position} rotation={[0, o.rotationY, 0]} userData={{ objectId: o.id }}>
      {/* Walkable surfaces pass hovers through to the ground, so the asset tool's ghost shows over roads and slabs too. */}
      <group
        onPointerDown={onDown}
        onPointerMove={blocksNavigation(o) ? undefined : applyGroundHover}
        onPointerOver={(e) => {
          if (e.pointerType === 'grab' || e.pointerType === 'touch') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
      >
        <GrabHandle
          targetRef={groupRef}
          filter={(e) => e.pointerType === 'grab' && useWorld.getState().tool === 'select'}
          translate={{ y: false }}
          rotate="y"
          scale={{ uniform: true }}
          apply={(state) => onGrab(state as HandleState<GrabMemo>)}
        >
          <Structure o={o} />
        </GrabHandle>
      </group>
      {!selected && (inGroup || inPreview) && <SelectionOutline size={o.size} color={inGroup ? '#7bdff2' : '#ffffff'} />}
      {!selected && !inGroup && !inPreview && hovered && <SelectionOutline size={o.size} color="#d8e6f0" />}
      {selected && (
        <>
          <SelectionOutline size={o.size} />
          <Handle position={[w / 2, top, d / 2]} size={r} color="#ffd166" onPointerDown={onResizeDown} />
          <Handle position={[0, top, -d / 2 - 2.3 * r]} size={r} color="#7bdff2" onPointerDown={onRotateDown} />
          <Button position={[-bx, top, bz]} size={r} color="#06d6a0" onPointerDown={press(duplicateSelected)} />
          <Button position={[-bx, top, -bz]} size={r} color="#b388eb" onPointerDown={press(cycleSelected)} />
          <Button position={[bx, top, -bz]} size={r} color="#ef476f" onPointerDown={press(deleteSelected)} />
        </>
      )}
    </group>
      {holding && useEditor.getState().snap && (
        <group position={o.position} rotation={[0, o.rotationY, 0]}>
          <mesh position={[0, o.size[1] / 2, 0]} raycast={() => null}>
            <boxGeometry args={o.size} />
            <meshBasicMaterial color="#7bdff2" transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <SelectionOutline size={o.size} color="#7bdff2" />
        </group>
      )}
    </>
  )
}

type HandleProps = { position: [number, number, number]; size: number; color: string; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }

/** Drag handle (sphere). */
function Handle(props: HandleProps) {
  return (
    <mesh position={props.position} onPointerDown={props.onPointerDown}>
      <sphereGeometry args={[props.size, 16, 12]} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.4} />
    </mesh>
  )
}

/** Press button (cube), so it reads differently from the drag handles. */
function Button(props: HandleProps) {
  return (
    <mesh position={props.position} rotation={[0, Math.PI / 4, 0]} onPointerDown={props.onPointerDown}>
      <boxGeometry args={[props.size * 1.3, props.size * 1.3, props.size * 1.3]} />
      <meshStandardMaterial color={props.color} emissive={props.color} emissiveIntensity={0.5} />
    </mesh>
  )
}
