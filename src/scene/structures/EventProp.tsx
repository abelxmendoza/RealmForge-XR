import type { WorldObject } from '../../world/types'
import { getEventCatalogEntry } from '../../world/eventCatalog'

/** Procedural event furniture / structures from the universal catalog. */
export function EventProp({ o }: { o: WorldObject }) {
  const entry = o.catalogId ? getEventCatalogEntry(o.catalogId) : undefined
  const mesh = entry?.mesh ?? 'box'
  const color = o.color ?? entry?.color ?? '#adb5bd'
  const [w, h, d] = o.size

  switch (mesh) {
    case 'cylinder':
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, h, 20]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      )
    case 'booth':
      return (
        <group>
          {/* Floor pad */}
          <mesh position={[0, 0.03, 0]} receiveShadow>
            <boxGeometry args={[w, 0.06, d]} />
            <meshStandardMaterial color="#f1f3f5" roughness={0.7} />
          </mesh>
          {/* Back wall */}
          <mesh position={[0, h / 2, -d / 2 + 0.06]} castShadow>
            <boxGeometry args={[w, h, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          {/* Counter */}
          <mesh position={[0, 0.95, d / 2 - 0.35]} castShadow>
            <boxGeometry args={[w * 0.9, 0.12, 0.55]} />
            <meshStandardMaterial color="#868e96" roughness={0.45} />
          </mesh>
        </group>
      )
    case 'stage':
      return (
        <group>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
          <mesh position={[0, h + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[w * 0.95, d * 0.95]} />
            <meshStandardMaterial color="#343a40" roughness={0.8} />
          </mesh>
        </group>
      )
    case 'desk':
      return (
        <group>
          <mesh position={[0, h * 0.45, 0]} castShadow>
            <boxGeometry args={[w, h * 0.9, d]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          <mesh position={[0, h, 0]} castShadow>
            <boxGeometry args={[w * 1.02, 0.08, d * 1.05]} />
            <meshStandardMaterial color="#adb5bd" roughness={0.4} />
          </mesh>
        </group>
      )
    case 'sign':
      return (
        <group>
          <mesh position={[0, h * 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.06, h * 0.3, 8]} />
            <meshStandardMaterial color="#868e96" />
          </mesh>
          <mesh position={[0, h * 0.65, 0]} castShadow>
            <boxGeometry args={[w, h * 0.55, d]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        </group>
      )
    case 'barrier':
      return (
        <group>
          <mesh position={[-w / 2 + 0.08, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, h, 8]} />
            <meshStandardMaterial color="#ced4da" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[w / 2 - 0.08, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, h, 8]} />
            <meshStandardMaterial color="#ced4da" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, h * 0.7, 0]} castShadow>
            <boxGeometry args={[w - 0.1, 0.06, 0.06]} />
            <meshStandardMaterial color="#fa5252" />
          </mesh>
        </group>
      )
    case 'box':
    default:
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      )
  }
}
