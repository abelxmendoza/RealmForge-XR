import type { WorldObject } from '../../world/types'
import { STEP_HEIGHT } from '../../world/types'
import { defaultMaterial } from '../../world/catalog'
import { MATERIAL_TILE, roadLineMaterial, surfaceMaterial } from '../materials'
import { tiledBox, tiledPlane, useGeometry } from '../geometry'

/** Flat surface: plazas, roads (asphalt gets a dashed centre line), raised decks. */
export function Platform({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  const mat = defaultMaterial(o)
  const tile = MATERIAL_TILE[mat]
  const geo = useGeometry(() => tiledBox(w, h, d, tile), [w, h, d, tile])
  const material = surfaceMaterial(mat)
  return (
    <group>
      <mesh position={[0, h / 2, 0]} geometry={geo} material={material} castShadow={h > STEP_HEIGHT} receiveShadow />
      {mat === 'asphalt' && <RoadLine w={w} h={h} d={d} />}
    </group>
  )
}

function RoadLine({ w, h, d }: { w: number; h: number; d: number }) {
  // Runs along the longer side; 15 cm line, one dash per 3 m (real road-marking spacing).
  const len = Math.max(w, d) - 0.5
  const geo = useGeometry(() => tiledPlane(len, 0.15, 3, 0.15), [len])
  return (
    <mesh position={[0, h + 0.004, 0]} rotation={[-Math.PI / 2, 0, w >= d ? 0 : Math.PI / 2]} geometry={geo} material={roadLineMaterial()} receiveShadow />
  )
}
