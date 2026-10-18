import { useRef, useSyncExternalStore } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Handle, type HandleState } from '@react-three/handle'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { useWorld } from '../world/store'
import { groundPoint } from '../scene/worldRoot'
import { SelectionOutline } from '../scene/structures'
import { beginDrag } from '../editor/drag'
import { useEditor } from '../editor/settings'
import { snapPoint } from '../world/snap'
import { worldActions } from '../world/actions'
import { actorRuntimeRevision, getActorRuntime, subscribeActorRuntime, tickActors } from './runtime'
import { ActorModel } from './ActorModels'
import type { Actor } from './types'

export function Actors() {
  const actors = useWorld((s) => s.actors)
  const selectedId = useWorld((s) => s.selectedActorId)
  useSyncExternalStore(subscribeActorRuntime, actorRuntimeRevision, actorRuntimeRevision)
  useFrame((_, dt) => tickActors(dt))
  const selected = selectedId ? getActorRuntime(selectedId) : null
  return <>
    {Object.values(actors).map((actor) => <ActorObject key={actor.id} actor={actor} />)}
    {selected && selected.status === 'moving' && selected.path.length > 1 && <Line points={selected.path.map(([x, z]) => [x, 0.12, z])} color={actors[selectedId!]?.color || '#65cdd0'} lineWidth={3} raycast={() => null} />}
  </>
}
function ActorObject({ actor }: { actor: Actor }) {
  const group = useRef<THREE.Group>(null)
  const selected = useWorld((s) => s.selectedActorId === actor.id)
  const yaw = useRef(new THREE.Euler())
  useFrame(() => {
    const runtime = getActorRuntime(actor.id)
    if (!group.current) return
    const position = runtime?.position ?? actor.position
    group.current.position.set(position[0], 0, position[1])
    group.current.rotation.y = runtime?.heading ?? actor.rotationY
  })
  const onDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    const world = useWorld.getState()
    world.setTool('select')
    worldActions.selectActor(actor.id)
    const point = groundPoint(event)
    if (!point) return
    const position = getActorRuntime(actor.id)?.position ?? actor.position
    const offset = [position[0] - point[0], position[1] - point[1]]
    beginDrag(event, { move: (at) => {
      let position: [number, number] = [at[0] + offset[0], at[1] + offset[1]]
      if (useEditor.getState().snap) position = snapPoint(position)
      const result = worldActions.updateActor(actor.id, { position })
      if (!result.ok) useEditor.getState().set({ actorMessage: result.error })
    } })
  }
  const onGrab = (state: HandleState<{ size: Actor['size'] }>) => {
    const world = useWorld.getState()
    if (state.first) {
      world.setTool('select')
      world.selectActor(actor.id)
      world.setDragging(true)
    }
    const memo = state.memo ?? { size: [...actor.size] as Actor['size'] }
    const result = worldActions.updateActor(actor.id, {
      position: [state.current.position.x, state.current.position.z],
      rotationY: yaw.current.setFromQuaternion(state.current.quaternion, 'YXZ').y,
      size: memo.size.map((v) => Math.max(0.3, Math.min(8, v * state.current.scale.x))) as Actor['size'],
    })
    if (!result.ok) useEditor.getState().set({ actorMessage: result.error })
    if (state.last) world.setDragging(false)
    return memo
  }
  return <group ref={group} position={[actor.position[0], 0, actor.position[1]]} rotation={[0, actor.rotationY, 0]}>
    <group onPointerDown={onDown}>
      <Handle targetRef={group} filter={(event) => event.pointerType === 'grab'} translate={{ y: false }} rotate="y" scale={{ uniform: true }} apply={(state) => onGrab(state as HandleState<{ size: Actor['size'] }>)}>
        <ActorModel actor={actor} />
      </Handle>
    </group>
    {selected && <SelectionOutline size={actor.size} color={actor.color} />}
  </group>
}
