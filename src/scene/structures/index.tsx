import { Edges } from '@react-three/drei'
import type { WorldObject } from '../../world/types'
import { Building } from './Building'
import { Wall } from './Wall'
import { Platform } from './Platform'
import { Crate, Streetlight, Tree } from './Decor'

/**
 * Draws one world object. Pure presentation: reads the object, never the store,
 * so it can be reused by previews, XR menus or thumbnails.
 */
export function Structure({ o }: { o: WorldObject }) {
  switch (o.kind) {
    case 'building':
      return <Building o={o} />
    case 'platform':
      return <Platform o={o} />
    case 'tree':
      return <Tree o={o} />
    case 'streetlight':
      return <Streetlight o={o} />
    case 'crate':
      return <Crate o={o} />
    case 'wall':
    default:
      return <Wall o={o} />
  }
}

/** Selection outline: a bright box around the object's bounds plus a footprint on the ground. */
export function SelectionOutline({ size, color = '#ffb347' }: { size: [number, number, number]; color?: string }) {
  const [w, h, d] = size
  const pad = 0.12
  return (
    <group>
      <mesh position={[0, h / 2, 0]} raycast={() => null}>
        <boxGeometry args={[w + pad, h + pad, d + pad]} />
        <meshBasicMaterial visible={false} />
        <Edges color={color} lineWidth={2} renderOrder={2} raycast={() => null} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w + pad * 3, d + pad * 3]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
