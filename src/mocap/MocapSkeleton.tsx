import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { BONES, JOINTS } from './rokoko'
import { mocapFrame } from './store'

const JOINT_MAT = new THREE.MeshStandardMaterial({ color: '#7bdff2', emissive: '#7bdff2', emissiveIntensity: 0.5 })
const BONE_MAT = new THREE.MeshStandardMaterial({ color: '#e8eaed', roughness: 0.6 })
const JOINT_GEO = new THREE.SphereGeometry(0.035, 10, 8)
const BONE_GEO = new THREE.CylinderGeometry(0.018, 0.018, 1, 6) // unit length, stretched per bone

const UP = new THREE.Vector3(0, 1, 0)
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const dir = new THREE.Vector3()

/**
 * Debug skeleton for the first Smartsuit actor: a sphere per joint and a stick per bone, positioned
 * straight from the latest frame every render frame (no React state per frame). Units are metres;
 * place it in the room (1:1) or inside the world root to scale it with the world.
 * Scaffolding: swap for a rigged avatar mesh and retarget joint rotations when ready.
 */
export function MocapSkeleton() {
  const joints = useRef<(THREE.Mesh | null)[]>([])
  const bones = useRef<(THREE.Mesh | null)[]>([])
  const group = useRef<THREE.Group>(null)
  const index = useMemo(() => new Map(JOINTS.map((n, i) => [n, i])), [])

  useFrame(() => {
    const actor = mocapFrame.current?.actors[0]
    if (group.current) group.current.visible = !!actor
    if (!actor) return
    JOINTS.forEach((name, i) => {
      const mesh = joints.current[i]
      const j = actor.joints[name]
      if (!mesh) return
      mesh.visible = !!j
      if (j) mesh.position.set(...j.position)
    })
    BONES.forEach(([from, to], i) => {
      const mesh = bones.current[i]
      const p = actor.joints[from]
      const c = actor.joints[to]
      if (!mesh) return
      mesh.visible = !!(p && c)
      if (!p || !c) return
      a.set(...p.position)
      b.set(...c.position)
      dir.subVectors(b, a)
      const len = dir.length()
      mesh.position.addVectors(a, b).multiplyScalar(0.5)
      mesh.scale.set(1, Math.max(len, 1e-4), 1)
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize())
    })
  })

  return (
    <group ref={group} visible={false}>
      {JOINTS.map((name) => (
        <mesh
          key={name}
          ref={(m) => {
            joints.current[index.get(name)!] = m
          }}
          geometry={JOINT_GEO}
          material={JOINT_MAT}
          castShadow
          raycast={() => null}
        />
      ))}
      {BONES.map(([from, to], i) => (
        <mesh
          key={`${from}-${to}`}
          ref={(m) => {
            bones.current[i] = m
          }}
          geometry={BONE_GEO}
          material={BONE_MAT}
          castShadow
          raycast={() => null}
        />
      ))}
    </group>
  )
}
