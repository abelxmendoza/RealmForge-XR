import { JOINTS, fromSceneSpace, type Joint, type JointName, type RokokoFrameV3 } from './rokoko.ts'

/**
 * Synthetic Rokoko JSON v3 frames: one actor walking slowly in a 1 m circle with swinging arms and legs.
 * Used by `npm run mocap:mock` (no suit needed) and by the parser tests. Explicit `.ts` import so the
 * Node bridge can load this file directly.
 */

/** Rest pose in scene space (metres, Y up, facing −Z), relative to the hips' ground point. */
const REST: Record<JointName, [number, number, number]> = {
  hip: [0, 0.98, 0],
  spine: [0, 1.1, 0],
  chest: [0, 1.3, 0],
  neck: [0, 1.5, 0],
  head: [0, 1.64, 0],
  leftShoulder: [-0.08, 1.44, 0],
  leftUpperArm: [-0.19, 1.43, 0],
  leftLowerArm: [-0.21, 1.15, 0],
  leftHand: [-0.22, 0.9, 0],
  rightShoulder: [0.08, 1.44, 0],
  rightUpperArm: [0.19, 1.43, 0],
  rightLowerArm: [0.21, 1.15, 0],
  rightHand: [0.22, 0.9, 0],
  leftUpLeg: [-0.09, 0.93, 0],
  leftLeg: [-0.1, 0.5, 0],
  leftFoot: [-0.1, 0.08, 0],
  leftToe: [-0.1, 0.02, -0.14],
  rightUpLeg: [0.09, 0.93, 0],
  rightLeg: [0.1, 0.5, 0],
  rightFoot: [0.1, 0.08, 0],
  rightToe: [0.1, 0.02, -0.14],
}

const SWING: Partial<Record<JointName, { side: 1 | -1; amount: number }>> = {
  leftLowerArm: { side: 1, amount: 0.12 },
  leftHand: { side: 1, amount: 0.22 },
  rightLowerArm: { side: -1, amount: 0.12 },
  rightHand: { side: -1, amount: 0.22 },
  leftLeg: { side: -1, amount: 0.1 },
  leftFoot: { side: -1, amount: 0.22 },
  leftToe: { side: -1, amount: 0.24 },
  rightLeg: { side: 1, amount: 0.1 },
  rightFoot: { side: 1, amount: 0.22 },
  rightToe: { side: 1, amount: 0.24 },
}

/** Joints of the mock actor at time `t` seconds, in scene space. */
export function mockJoints(t: number): Record<JointName, Joint> {
  const radius = 1
  const speed = 0.4 // rad/s around the circle
  const a = t * speed
  const cx = Math.cos(a) * radius
  const cz = Math.sin(a) * radius
  // Facing along the circle's tangent.
  const yaw = -a
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const step = Math.sin(t * 5)
  const bob = Math.abs(Math.cos(t * 5)) * 0.03
  const rotation: Joint['rotation'] = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]

  const out = {} as Record<JointName, Joint>
  for (const name of JOINTS) {
    const [x, y, z0] = REST[name]
    const sw = SWING[name]
    const z = z0 + (sw ? sw.side * sw.amount * step : 0)
    // Rotate the local pose by yaw, then move it onto the circle.
    out[name] = { position: [cx + c * x + s * z, y + bob, cz - s * x + c * z], rotation }
  }
  return out
}

/** A full Rokoko JSON v3 frame (wire format) for time `t` seconds. */
export function mockFrame(t: number, fps = 60): RokokoFrameV3 {
  const joints = mockJoints(t)
  const body: Record<string, ReturnType<typeof fromSceneSpace>> = {}
  for (const name of JOINTS) body[name] = fromSceneSpace(joints[name])
  return {
    version: 3,
    fps,
    scene: {
      timestamp: t,
      actors: [{ name: 'Mock actor', meta: { hasBody: true, hasGloves: false, hasFace: false }, body }],
      props: [],
    },
  }
}
