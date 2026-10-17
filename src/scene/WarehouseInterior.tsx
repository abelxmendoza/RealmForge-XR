import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEnvironment } from '../world/environment'
import { worldRootRef } from './worldRoot'

const BAYS = [-30, -15, 0, 15, 30]
const NO_RAYCAST = () => null

function Part({ at, size, color = '#56616b', glow = false }: { at: [number, number, number]; size: [number, number, number]; color?: string; glow?: boolean }) {
  return <mesh position={at} receiveShadow raycast={NO_RAYCAST}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} roughness={0.72} metalness={0.2} emissive={glow ? color : '#000000'} emissiveIntensity={glow ? 1.5 : 0} />
  </mesh>
}

/** Presentation shell outside the editable map; never intercepts object/ground pointers. */
export function WarehouseInterior() {
  const active = useEnvironment((s) => s.activeId === 'warehouse')
  const roof = useRef<THREE.Group>(null)
  const west = useRef<THREE.Group>(null)
  const east = useRef<THREE.Group>(null)
  const north = useRef<THREE.Group>(null)
  const south = useRef<THREE.Group>(null)
  const eye = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera }) => {
    if (!active || !worldRootRef.current) return
    camera.getWorldPosition(eye)
    worldRootRef.current.worldToLocal(eye)
    // Roof and near walls cut away for the miniature; all faces return when viewed inside.
    if (roof.current) roof.current.visible = eye.y < 12 && Math.abs(eye.x) < 40 && Math.abs(eye.z) < 40
    if (west.current) west.current.visible = eye.x > -40
    if (east.current) east.current.visible = eye.x < 40
    if (north.current) north.current.visible = eye.z > -40
    if (south.current) south.current.visible = eye.z < 40
  })
  if (!active) return null
  return <group>
    <Part at={[0, -0.16, 0]} size={[80, 0.3, 80]} color="#777d80" />
    {/* Expansion joints and painted pedestrian / vehicle aisle edges. */}
    {[-32, -16, 0, 16, 32].map((v) => <group key={v}>
      <Part at={[v, 0.004, 0]} size={[0.025, 0.008, 80]} color="#5d6466" />
      <Part at={[0, 0.004, v]} size={[80, 0.008, 0.025]} color="#5d6466" />
    </group>)}
    {[-5, 5].map((x) => <Part key={x} at={[x, 0.19, 0]} size={[0.16, 0.015, 72]} color="#edbc49" />)}
    {[-24, 0, 24].flatMap((z) => [-4.5, 4.5].map((offset) => <Part key={`${z}-${offset}`} at={[0, 0.19, z + offset]} size={[72, 0.015, 0.12]} color="#edbc49" />))}
    <group ref={west}><SideWall x={-40.4} /></group>
    <group ref={east}><SideWall x={40.4} /></group>
    <group ref={north}><EndWall z={-40.4} docks /></group>
    <group ref={south}><EndWall z={40.4} /></group>
    {/* Steel portal frames and high-bay fixtures remain visible in the cutaway. */}
    {BAYS.map((z) => <group key={z}>
      {[-39, 39].map((x) => <group key={x}>
        <Part at={[x, 6, z]} size={[0.55, 12, 0.65]} />
        <Part at={[x, 0.7, z]} size={[0.7, 1.4, 0.8]} color="#e2ad39" />
      </group>)}
      <Part at={[0, 11.6, z]} size={[79, 0.45, 0.4]} />
      <Part at={[0, 10.4, z]} size={[79, 0.25, 0.3]} />
      {[-30, -15, 0, 15, 30].map((x) => <group key={x}>
        <Part at={[x, 11, z]} size={[0.18, 1.2, 0.25]} />
        <Part at={[x, 10, z]} size={[3.6, 0.18, 1]} color="#303b44" />
        <Part at={[x, 9.88, z]} size={[3.3, 0.06, 0.8]} color="#e5f3ff" glow />
      </group>)}
    </group>)}
    <group ref={roof}>
      <Part at={[0, 12.3, 0]} size={[81, 0.4, 81]} color="#626e78" />
      {[-24, 0, 24].map((x) => <Part key={x} at={[x, 12.05, 0]} size={[3, 0.08, 78]} color="#c6e4ee" glow />)}
    </group>
  </group>
}

function SideWall({ x }: { x: number }) {
  return <group>
    <Part at={[x, 6, 0]} size={[0.6, 12, 81]} color="#abb2b5" />
    <Part at={[x + (x < 0 ? 0.33 : -0.33), 1, 0]} size={[0.08, 2, 80]} color="#4e6470" />
    {Array.from({ length: 41 }, (_, i) => <Part key={i} at={[x + (x < 0 ? 0.35 : -0.35), 7, -40 + i * 2]} size={[0.1, 10, 0.06]} color="#909ba2" />)}
  </group>
}

function EndWall({ z, docks = false }: { z: number; docks?: boolean }) {
  return <group>
    <Part at={[0, 6, z]} size={[81, 12, 0.6]} color="#abb2b5" />
    {[-24, 0, 24].map((x) => <group key={x}>
      <Part at={[x, 3.1, z + (z < 0 ? 0.36 : -0.36)]} size={[9, 6.2, 0.2]} color="#303c46" />
      <Part at={[x, 3.1, z + (z < 0 ? 0.5 : -0.5)]} size={[7.6, 5.8, 0.12]} color="#7d8b95" />
      {Array.from({ length: 10 }, (_, i) => <Part key={i} at={[x, 0.4 + i * 0.57, z + (z < 0 ? 0.58 : -0.58)]} size={[7.5, 0.06, 0.05]} color="#52616c" />)}
      {[-5, 5].map((offset) => <Part key={offset} at={[x + offset, 0.65, z + (z < 0 ? 1 : -1)]} size={[0.4, 1.3, 0.4]} color="#e8b440" />)}
      {docks && <Part at={[x, 7, z + 0.4]} size={[3.5, 0.7, 0.1]} color="#e8b440" />}
    </group>)}
  </group>
}
