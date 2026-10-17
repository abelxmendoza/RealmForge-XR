import { useMemo } from 'react'
import type { WorldObject } from '../../world/types'
import { BUILDING_STYLES, buildingRoof, buildingStyle } from '../../world/catalog'
import { FACADE_TILE, facadeMaterial, flatMaterial, glowMaterial } from '../materials'
import { gableRoof, tiledBox, useGeometry } from '../geometry'

const ROOF_COLOR = { house: '#9b4f3c', other: '#4d5864' }
const TRIM = flatMaterial('#e9e5dc', { roughness: 0.9 })
const ROOF_TOP = flatMaterial('#5f6873', { roughness: 0.95 })
const METAL = flatMaterial('#9aa4ad', { roughness: 0.55, metalness: 0.2 })
const DARK_METAL = flatMaterial('#4c555e', { roughness: 0.55, metalness: 0.2 })
const WOOD_DOOR = flatMaterial('#6b4226')
const GLASS_DOOR = flatMaterial('#8fd3f5', { emissive: '#8fd3f5', emissiveIntensity: 0.35, roughness: 0.2 })
const GARAGE = flatMaterial('#7c868f', { roughness: 0.6, metalness: 0.15 })
const BEACON = glowMaterial('#ff4d4d')

/**
 * A building: textured body (windows glow from the facade's emissive map), a roof that is
 * flat with rooftop details or pitched, and a door on the local +z face.
 * The footprint is exactly size[0] × size[2], so navigation's rectangle stays accurate.
 */
export function Building({ o }: { o: WorldObject }) {
  const [w, h, d] = o.size
  const style = buildingStyle(o)
  const roof = buildingRoof(o)
  const tint = o.color ?? BUILDING_STYLES[style].color
  const [tu, tv] = FACADE_TILE[style]
  const body = useGeometry(() => tiledBox(w, h, d, tu, tv), [w, h, d, tu, tv])
  const facade = facadeMaterial(style, tint)
  const mats = useMemo(() => [facade, facade, ROOF_TOP, ROOF_TOP, facade, facade], [facade])

  return (
    <group>
      <mesh position={[0, h / 2, 0]} geometry={body} material={mats} castShadow receiveShadow />
      {roof === 'pitched' ? <PitchedRoof w={w} h={h} d={d} color={style === 'house' ? ROOF_COLOR.house : ROOF_COLOR.other} /> : <FlatRoof style={style} w={w} h={h} d={d} />}
      <Door style={style} w={w} h={h} d={d} />
    </group>
  )
}

function PitchedRoof({ w, h, d, color }: { w: number; h: number; d: number; color: string }) {
  // Ridge runs along the longer side; eaves overhang a little.
  const alongX = w >= d
  const span = alongX ? d : w
  const len = alongX ? w : d
  const rise = Math.min(span * 0.45, 1.6)
  const geo = useGeometry(() => gableRoof(len + 0.3, span + 0.3, rise), [len, span, rise])
  return (
    <mesh position={[0, h, 0]} rotation={[0, alongX ? 0 : Math.PI / 2, 0]} geometry={geo} material={flatMaterial(color, { flatShading: true })} castShadow receiveShadow />
  )
}

function FlatRoof({ style, w, h, d }: { style: string; w: number; h: number; d: number }) {
  return (
    <>
      {/* Parapet cap: reads as a crisp roof edge from above. */}
      <mesh position={[0, h + 0.05, 0]} material={TRIM} receiveShadow>
        <boxGeometry args={[w + 0.08, 0.1, d + 0.08]} />
      </mesh>
      {style === 'tower' && (
        <>
          <mesh position={[0, h + 0.35, 0]} material={DARK_METAL} castShadow>
            <boxGeometry args={[w * 0.55, 0.5, d * 0.55]} />
          </mesh>
          <mesh position={[w * 0.12, h + 1.1, -d * 0.1]} material={METAL}>
            <cylinderGeometry args={[0.03, 0.05, 1.2, 6]} />
          </mesh>
          <mesh position={[w * 0.12, h + 1.75, -d * 0.1]} material={BEACON}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
        </>
      )}
      {style === 'office' && (
        <mesh position={[-w * 0.2, h + 0.25, -d * 0.15]} material={METAL} castShadow>
          <boxGeometry args={[Math.min(1, w * 0.3), 0.4, Math.min(0.8, d * 0.3)]} />
        </mesh>
      )}
      {style === 'industrial' && (
        <>
          <mesh position={[w * 0.32, h + 0.6, -d * 0.25]} material={DARK_METAL} castShadow>
            <cylinderGeometry args={[0.16, 0.2, 1.2, 8]} />
          </mesh>
          <mesh position={[-w * 0.2, h + 0.18, 0]} material={METAL} castShadow>
            <boxGeometry args={[w * 0.35, 0.25, d * 0.7]} />
          </mesh>
        </>
      )}
    </>
  )
}

function Door({ style, w, h, d }: { style: string; w: number; h: number; d: number }) {
  const [dw, dh, mat] =
    style === 'house'
      ? [0.55, 0.95, WOOD_DOOR]
      : style === 'industrial'
        ? [Math.min(1.8, w * 0.45), 1.5, GARAGE]
        : [Math.min(0.9, w * 0.4), 1.05, GLASS_DOOR]
  const doorH = Math.min(dh, h * 0.7)
  const doorW = Math.min(dw, w * 0.8)
  return (
    <mesh position={[0, doorH / 2, d / 2 + 0.03]} material={mat}>
      <boxGeometry args={[doorW, doorH, 0.06]} />
    </mesh>
  )
}
