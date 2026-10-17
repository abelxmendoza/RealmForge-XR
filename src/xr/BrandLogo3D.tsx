import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { BRAND } from '../theme/brand'

/** The RealmForge logo as a small unlit square in 3D space (headset panels and menus). */
export function BrandLogo3D({ position, size }: { position: [number, number, number]; size: number }) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(BRAND.logo)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={position} raycast={() => null}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
