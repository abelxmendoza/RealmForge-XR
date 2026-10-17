import type { WorldObject } from '../../world/types'
import { defaultMaterial } from '../../world/catalog'
import { MATERIAL_TILE, flatMaterial, surfaceMaterial } from '../materials'
import { tiledBox, useGeometry } from '../geometry'

const CAP = flatMaterial('#8b949c', { roughness: 0.6, metalness: 0.15 })

/** A wall: textured slab plus a thin coping cap. */
export function Wall({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  const mat = defaultMaterial(o)
  const tile = MATERIAL_TILE[mat]
  const geo = useGeometry(() => tiledBox(w, h, d, tile), [w, h, d, tile])
  const material = surfaceMaterial(mat)
  return (
    <group>
      <mesh position={[0, h / 2, 0]} geometry={geo} material={material} castShadow={mat !== 'glass'} receiveShadow />
      <mesh position={[0, h + 0.04, 0]} material={CAP} castShadow>
        <boxGeometry args={[w + 0.04, 0.08, d + 0.08]} />
      </mesh>
    </group>
  )
}
