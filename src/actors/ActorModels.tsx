import type { Actor } from './types'

/** Three distinct procedural silhouettes; no external models or network fonts. */
export function ActorModel({ actor }: { actor: Actor }) {
  const box = (key: string, p: [number, number, number], size: [number, number, number], color = actor.color) => <mesh key={key} position={p} castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.6} /></mesh>
  const wheel = (x: number, z: number, radius = 0.16) => <mesh key={`${x}-${z}`} position={[x, radius, z]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[radius, radius, 0.12, 12]} /><meshStandardMaterial color="#25323b" /></mesh>
  return <group scale={actor.size}>
    {actor.kind === 'worker' ? <>
      {box('left-leg', [-0.2, 0.2, 0], [0.24, 0.4, 0.35], '#2a4259')}
      {box('right-leg', [0.2, 0.2, 0], [0.24, 0.4, 0.35], '#2a4259')}
      {box('torso', [0, 0.6, 0], [0.65, 0.4, 0.45])}
      {box('arm-l', [-0.43, 0.59, 0], [0.14, 0.32, 0.22])}
      {box('arm-r', [0.43, 0.59, 0], [0.14, 0.32, 0.22])}
      {box('head', [0, 0.87, 0], [0.4, 0.2, 0.38], '#d8ad87')}
      {box('helmet', [0, 0.98, 0], [0.52, 0.04, 0.48])}
      {box('visor', [0, 0.88, 0.196], [0.3, 0.08, 0.025], '#203846')}
      {box('vest', [0, 0.62, 0.234], [0.1, 0.27, 0.02], '#f9e9b8')}
    </> : actor.kind === 'courier' ? <>
      {wheel(-0.4, -0.23)}{wheel(0.4, -0.23)}{wheel(-0.4, 0.23)}{wheel(0.4, 0.23)}
      {box('body', [0, 0.44, 0], [0.72, 0.55, 0.72])}
      {box('head', [0, 0.82, 0.08], [0.58, 0.23, 0.54], '#e5e6d7')}
      {box('face', [0, 0.83, 0.36], [0.43, 0.1, 0.02], '#183843')}
      {box('eye-l', [-0.12, 0.84, 0.38], [0.05, 0.04, 0.02], '#74e9e4')}
      {box('eye-r', [0.12, 0.84, 0.38], [0.05, 0.04, 0.02], '#74e9e4')}
      {box('antenna', [0, 0.97, 0], [0.04, 0.06, 0.04], '#f4d496')}
    </> : <>
      {wheel(-0.43, -0.3, 0.19)}{wheel(0.43, -0.3, 0.19)}{wheel(-0.43, 0.3, 0.19)}{wheel(0.43, 0.3, 0.19)}
      {box('chassis', [0, 0.34, 0], [0.8, 0.25, 0.95])}
      {box('cabin', [0, 0.68, 0.19], [0.69, 0.62, 0.5])}
      {box('windshield', [0, 0.73, 0.451], [0.55, 0.32, 0.015], '#1b4254')}
      {box('bed', [0, 0.51, -0.3], [0.7, 0.14, 0.34], '#637485')}
      {box('light-l', [-0.26, 0.4, 0.48], [0.1, 0.09, 0.02], '#fff5c9')}
      {box('light-r', [0.26, 0.4, 0.48], [0.1, 0.09, 0.02], '#fff5c9')}
    </>}
  </group>
}
