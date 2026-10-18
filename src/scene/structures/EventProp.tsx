import type { WorldObject } from '../../world/types'
import { getEventCatalogEntry } from '../../world/eventCatalog'

/** Evenly spaced leg positions along a conveyor of length `w` (about every 1.5 m). */
const legs = (w: number) => {
  const n = Math.max(2, Math.round(w / 1.5) + 1)
  return Array.from({ length: n }, (_, i) => -w / 2 + 0.1 + (i * (w - 0.2)) / (n - 1))
}

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
    case 'tent':
      return (
        <group>
          {/* Counter under a peaked canopy on four poles */}
          <mesh position={[0, 0.5, d / 2 - 0.3]} castShadow>
            <boxGeometry args={[w * 0.9, 1, 0.5]} />
            <meshStandardMaterial color="#e9ecef" roughness={0.6} />
          </mesh>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[(sx * w) / 2.1, (h * 0.75) / 2, (sz * d) / 2.1]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, h * 0.75, 6]} />
                <meshStandardMaterial color="#ced4da" metalness={0.4} roughness={0.4} />
              </mesh>
            )),
          )}
          <mesh position={[0, h * 0.75 + (h * 0.25) / 2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[w / Math.SQRT2, 1, d / Math.SQRT2]} castShadow>
            <coneGeometry args={[1, h * 0.25, 4]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>
      )
    case 'machine':
      return (
        <group>
          <mesh position={[0, h * 0.4, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, h * 0.8, d]} />
            <meshStandardMaterial color={color} roughness={0.45} metalness={0.25} />
          </mesh>
          {/* Control panel and status beacon */}
          <mesh position={[w * 0.3, h * 0.55, d / 2 + 0.03]}>
            <boxGeometry args={[w * 0.25, h * 0.25, 0.05]} />
            <meshStandardMaterial color="#1c2a38" emissive="#4dabf7" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[-w * 0.35, h * 0.8 + 0.2, -d * 0.3]}>
            <cylinderGeometry args={[0.08, 0.08, 0.4, 10]} />
            <meshStandardMaterial color="#51cf66" emissive="#51cf66" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, h * 0.8 + 0.01, 0]} receiveShadow>
            <boxGeometry args={[w * 0.96, 0.02, d * 0.96]} />
            <meshStandardMaterial color="#dee2e6" roughness={0.5} />
          </mesh>
        </group>
      )
    case 'conveyor':
      return (
        <group>
          <mesh position={[0, h - 0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, 0.12, d]} />
            <meshStandardMaterial color="#212529" roughness={0.9} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, h - 0.04, (side * d) / 2]} castShadow>
              <boxGeometry args={[w, 0.16, 0.06]} />
              <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
            </mesh>
          ))}
          {legs(w).map((x) => (
            <mesh key={x} position={[x, (h - 0.12) / 2, 0]} castShadow>
              <boxGeometry args={[0.08, h - 0.12, d * 0.9]} />
              <meshStandardMaterial color="#868e96" metalness={0.4} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )
    case 'tower':
      return (
        <group>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[w, 0.6, d]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, h, 8]} />
            <meshStandardMaterial color="#adb5bd" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, h - 0.3, 0.15]}>
            <boxGeometry args={[w * 1.2, 0.6, 0.2]} />
            <meshStandardMaterial color="#fff9db" emissive="#fff3bf" emissiveIntensity={0.9} />
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
