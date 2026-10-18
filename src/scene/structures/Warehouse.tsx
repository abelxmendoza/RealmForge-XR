import type { WorldObject } from '../../world/types'
import { palletStyle, rackStyle } from '../../world/catalog'
import { PALLET } from '../../world/scale'
import { flatMaterial } from '../materials'
import { palletGeometry, rackGeometry } from './warehouseGeometry'

const WOOD = flatMaterial('#c9a26a', { roughness: 0.9 })
const CARTON = flatMaterial('#b98b57', { roughness: 0.95 })
const WRAP = flatMaterial('#dfeaf0', { roughness: 0.25, transparent: true, opacity: 0.45, depthWrite: false })
const UPRIGHT = flatMaterial('#2f5fa8', { roughness: 0.5, metalness: 0.35 })
const BEAM = flatMaterial('#e8772e', { roughness: 0.5, metalness: 0.3 })

/**
 * A pallet at real size (1.2 × 1.0 m EUR): boards and blocks, optionally a carton stack or shrink-wrap.
 * Geometry is built at the standard size and scaled to the object, so a resized pallet keeps its look.
 */
export function Pallet({ o }: { o: WorldObject }) {
  const style = palletStyle(o)
  const g = palletGeometry(style)
  const [w, h, d] = o.size
  const scale: [number, number, number] = [w / PALLET.width, h / PALLET.heightFor[style], d / PALLET.depth]
  return (
    <group scale={scale}>
      <mesh geometry={g.wood} material={WOOD} castShadow receiveShadow />
      {g.load && <mesh geometry={g.load} material={CARTON} castShadow receiveShadow />}
      {g.wrap && <mesh geometry={g.wrap} material={WRAP} />}
    </group>
  )
}

/**
 * One bay of selective pallet racking: blue frames, orange beam levels every 1.5 m, and (loaded) two
 * pallets per level. Built at the object's actual size, so taller racks get more levels.
 */
export function Rack({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  const g = rackGeometry(w, h, d, rackStyle(o))
  return (
    <group>
      <mesh geometry={g.frame} material={UPRIGHT} castShadow receiveShadow />
      <mesh geometry={g.beams} material={BEAM} castShadow />
      {g.wood && <mesh geometry={g.wood} material={WOOD} castShadow receiveShadow />}
      {g.load && <mesh geometry={g.load} material={CARTON} castShadow receiveShadow />}
    </group>
  )
}
