import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Box whose UVs are measured in map units / tile, so a repeating texture keeps the same
 * scale on a 1 m wall and a 12 m wall. Face order follows THREE.BoxGeometry: +x, −x, +y, −y, +z, −z.
 */
export function tiledBox(w: number, h: number, d: number, tileU: number, tileV = tileU): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // [u extent, v extent] per face.
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faces[f]
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setXY(i, (uv.getX(i) * su) / tileU, (uv.getY(i) * sv) / tileV)
    }
  }
  return g
}

/** Plane (in its own XY) with UVs measured in map units / tile. */
export function tiledPlane(w: number, h: number, tileU: number, tileV = tileU): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileU, (uv.getY(i) * h) / tileV)
  return g
}

/**
 * Gable roof: a triangular prism with its ridge along local x, base at y = 0.
 * Covers a w × d footprint and rises `rise` at the ridge.
 */
export function gableRoof(w: number, d: number, rise: number): THREE.BufferGeometry {
  const x = w / 2
  const z = d / 2
  // prettier-ignore
  const p = [
    // Front slope (+z)
    -x, 0, z,   x, 0, z,   x, rise, 0,
    -x, 0, z,   x, rise, 0,   -x, rise, 0,
    // Back slope (−z)
    x, 0, -z,   -x, 0, -z,   -x, rise, 0,
    x, 0, -z,   -x, rise, 0,   x, rise, 0,
    // Gables
    x, 0, z,   x, 0, -z,   x, rise, 0,
    -x, 0, -z,   -x, 0, z,   -x, rise, 0,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.computeVertexNormals()
  return g
}

/** useMemo for geometry that also disposes the previous one when the inputs change or on unmount. */
export function useGeometry<T extends THREE.BufferGeometry>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, deps)
  useEffect(() => () => g.dispose(), [g])
  return g
}
