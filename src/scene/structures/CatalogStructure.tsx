import type { WorldObject } from '../../world/types'

/** Normalized procedural shapes stay inside the object's saved collision footprint. */
export function CatalogStructure({ o }: { o: WorldObject }) {
  const color = o.color || '#8fa6c9'
  const box = (key: string, position: [number, number, number], size: [number, number, number], tint = color) => <mesh key={key} position={position} castShadow receiveShadow>
    <boxGeometry args={size} /><meshStandardMaterial color={tint} roughness={0.65} />
  </mesh>
  const posts = [-0.45, 0.45].flatMap((x) => [-0.4, 0.4].map((z) => box(`${x}-${z}`, [x, 0.5, z], [0.07, 1, 0.08], '#42566c')))
  return <group scale={o.size}>
    {o.assetId === 'storage-rack' ? <>
      {posts}
      {[0.08, 0.5, 0.92].map((y) => box(`shelf-${y}`, [0, y, 0], [1, 0.07, 1]))}
      {[-0.25, 0.2].map((x) => box(`cargo-${x}`, [x, 0.27, 0], [0.3, 0.3, 0.6], '#a67c52'))}
    </> : o.assetId === 'workstation' ? <>
      {posts}{box('bench', [0, 0.65, 0], [1, 0.08, 1])}
      {box('screen', [0.2, 0.85, -0.25], [0.35, 0.3, 0.06], '#183849')}
      {box('screen-light', [0.2, 0.85, -0.212], [0.28, 0.2, 0.01], '#79d5e1')}
    </> : o.assetId === 'conveyor' ? <>
      {posts}{box('belt', [0, 0.85, 0], [1, 0.15, 0.86], '#344252')}
      {[-0.45, 0.45].map((z) => box(`rail-${z}`, [0, 0.94, z], [1, 0.12, 0.08]))}
      {Array.from({ length: 9 }, (_, i) => box(`roller-${i}`, [-0.44 + i * 0.11, 0.94, 0], [0.035, 0.025, 0.78], '#b4c0cb'))}
    </> : o.assetId === 'barrier' ? <>
      {box('barrier', [0, 0.55, 0], [1, 0.65, 0.45])}
      {[-0.35, 0, 0.35].map((x) => box(`stripe-${x}`, [x, 0.55, 0.23], [0.12, 0.65, 0.02], '#252c35'))}
      {[-0.35, 0.35].map((x) => box(`foot-${x}`, [x, 0.08, 0], [0.2, 0.16, 1], '#42566c'))}
    </> : o.assetId === 'cargo' ? <>
      {box('cargo', [0, 0.5, 0], [1, 1, 1])}
      {[-0.33, 0.33].map((x) => box(`strap-${x}`, [x, 0.5, 0], [0.06, 1, 1], '#495c70'))}
    </> : <>
      {box('pad', [0, 0.45, 0], [1, 0.9, 1], '#263c49')}
      {[-0.45, 0.45].map((x) => box(`side-${x}`, [x, 0.96, 0], [0.06, 0.08, 0.95]))}
      {[-0.45, 0.45].map((z) => box(`end-${z}`, [0, 0.96, z], [0.95, 0.08, 0.06]))}
      {o.destinationRole === 'charging' ? <>
        {box('battery', [0, 0.96, 0], [0.5, 0.08, 0.55])}
        {box('battery-cap', [0, 0.96, -0.32], [0.18, 0.08, 0.1])}
        {box('battery-plus', [0, 1, 0], [0.06, 0.02, 0.25], '#163b2a')}
      </> : o.destinationRole === 'inspection' ? <>
        {box('cross-a', [0, 0.96, 0], [0.12, 0.08, 0.55])}
        {box('cross-b', [0, 0.96, 0], [0.55, 0.08, 0.12])}
      </> : <>
        {box('arrow', [0, 0.96, 0], [0.12, 0.08, 0.6])}
        {box('arrow-left', [-0.12, 0.96, o.destinationRole === 'pickup' ? 0.15 : -0.15], [0.35, 0.08, 0.12])}
      </>}
    </>}
  </group>
}
