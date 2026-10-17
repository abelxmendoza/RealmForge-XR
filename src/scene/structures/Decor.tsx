import type { WorldObject } from '../../world/types'
import { defaultMaterial, treeStyle } from '../../world/catalog'
import { crateMaterial, flatMaterial, glowMaterial } from '../materials'

const TRUNK = flatMaterial('#7a5536', { flatShading: true })
const LEAF_ROUND = flatMaterial('#5f9e4a', { flatShading: true })
const LEAF_PINE = flatMaterial('#3f7a4f', { flatShading: true })
const POLE = flatMaterial('#3a424a', { roughness: 0.5, metalness: 0.6 })
const LAMP = glowMaterial('#ffe7a3')

/** Low-poly tree. Foliage fills the object's footprint and height. */
export function Tree({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  const r = Math.min(w, d) / 2
  const trunkH = h * 0.4
  if (treeStyle(o) === 'pine') {
    return (
      <group>
        <mesh position={[0, trunkH / 2, 0]} material={TRUNK} castShadow>
          <cylinderGeometry args={[r * 0.12, r * 0.16, trunkH, 5]} />
        </mesh>
        <mesh position={[0, trunkH * 0.6 + (h * 0.5) / 2, 0]} material={LEAF_PINE} castShadow>
          <coneGeometry args={[r, h * 0.5, 7]} />
        </mesh>
        <mesh position={[0, h - (h * 0.4) / 2, 0]} material={LEAF_PINE} castShadow>
          <coneGeometry args={[r * 0.7, h * 0.4, 7]} />
        </mesh>
      </group>
    )
  }
  const crownH = h - trunkH * 0.8
  return (
    <group>
      <mesh position={[0, trunkH / 2, 0]} material={TRUNK} castShadow>
        <cylinderGeometry args={[r * 0.12, r * 0.16, trunkH, 5]} />
      </mesh>
      <mesh position={[0, h - crownH / 2, 0]} scale={[1, crownH / (2 * r), 1]} material={LEAF_ROUND} castShadow>
        <icosahedronGeometry args={[r, 0]} />
      </mesh>
    </group>
  )
}

/** Streetlight with an unlit glowing lamp and a fake light pool on the ground (no real light: cheap on Quest). */
export function Streetlight({ o }: { o: WorldObject }) {
  const h = o.size[1]
  const arm = 0.45
  return (
    <group>
      <mesh position={[0, 0.08, 0]} material={POLE}>
        <cylinderGeometry args={[0.1, 0.12, 0.16, 8]} />
      </mesh>
      <mesh position={[0, h / 2, 0]} material={POLE} castShadow>
        <cylinderGeometry args={[0.035, 0.05, h, 6]} />
      </mesh>
      <mesh position={[arm / 2, h - 0.03, 0]} material={POLE}>
        <boxGeometry args={[arm, 0.05, 0.06]} />
      </mesh>
      <mesh position={[arm - 0.04, h - 0.1, 0]} material={LAMP}>
        <boxGeometry args={[0.22, 0.07, 0.14]} />
      </mesh>
      <mesh position={[arm - 0.04, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[0.85, 20]} />
        <meshBasicMaterial color="#ffe7a3" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function Crate({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  return (
    <mesh position={[0, h / 2, 0]} material={crateMaterial(defaultMaterial(o))} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
    </mesh>
  )
}
