/**
 * Rokoko Smartsuit Pro live data (Rokoko Studio → Livestream → Custom, "JSON v3", uncompressed).
 *
 * Studio sends one JSON document per frame over UDP; tools/mocap-bridge.ts relays it to the browser
 * over WebSocket. This module turns a frame into scene-space joints. Everything here is pure, so it
 * runs in tests and in the bridge's mock mode.
 *
 * VERIFY WITH A LIVE SUIT: joint names follow Rokoko's JSON v3 body schema as documented; the axis
 * conversion in toSceneSpace() is the one place to adjust if the skeleton comes out mirrored.
 */

/** Body joints drawn by the debug skeleton (fingers and face are ignored for now). */
export const JOINTS = [
  'hip',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpLeg',
  'leftLeg',
  'leftFoot',
  'leftToe',
  'rightUpLeg',
  'rightLeg',
  'rightFoot',
  'rightToe',
] as const
export type JointName = (typeof JOINTS)[number]

/** Parent → child pairs for drawing bones. */
export const BONES: [JointName, JointName][] = [
  ['hip', 'spine'],
  ['spine', 'chest'],
  ['chest', 'neck'],
  ['neck', 'head'],
  ['chest', 'leftShoulder'],
  ['leftShoulder', 'leftUpperArm'],
  ['leftUpperArm', 'leftLowerArm'],
  ['leftLowerArm', 'leftHand'],
  ['chest', 'rightShoulder'],
  ['rightShoulder', 'rightUpperArm'],
  ['rightUpperArm', 'rightLowerArm'],
  ['rightLowerArm', 'rightHand'],
  ['hip', 'leftUpLeg'],
  ['leftUpLeg', 'leftLeg'],
  ['leftLeg', 'leftFoot'],
  ['leftFoot', 'leftToe'],
  ['hip', 'rightUpLeg'],
  ['rightUpLeg', 'rightLeg'],
  ['rightLeg', 'rightFoot'],
  ['rightFoot', 'rightToe'],
]

// ---- Wire format (Rokoko JSON v3), only the parts we read ----
export interface RokokoVec3 {
  x: number
  y: number
  z: number
}
export interface RokokoQuat extends RokokoVec3 {
  w: number
}
export interface RokokoJoint {
  position: RokokoVec3
  rotation: RokokoQuat
}
export interface RokokoActor {
  name?: string
  meta?: { hasBody?: boolean; hasGloves?: boolean; hasFace?: boolean }
  body?: Partial<Record<string, RokokoJoint>>
}
export interface RokokoFrameV3 {
  version?: number
  fps?: number
  scene: { timestamp?: number; actors: RokokoActor[]; props?: unknown[] }
}

// ---- What the app uses ----
/** A joint in scene space: metres, Y up, three.js (right-handed) axes. */
export interface Joint {
  position: [x: number, y: number, z: number]
  rotation: [x: number, y: number, z: number, w: number]
}
export interface MocapActor {
  name: string
  joints: Partial<Record<JointName, Joint>>
}
export interface MocapFrame {
  timestamp: number
  fps?: number
  actors: MocapActor[]
}

/**
 * Rokoko space → three.js space. Rokoko streams metres with Y up in a left-handed frame, so we mirror
 * across Z: position (x, y, −z), rotation (−x, −y, z, w). If a live suit shows up mirrored or facing
 * backwards, change it here only.
 */
export const MIRROR_Z = true
export function toSceneSpace(j: RokokoJoint): Joint {
  const { position: p, rotation: q } = j
  return MIRROR_Z
    ? { position: [p.x, p.y, -p.z], rotation: [-q.x, -q.y, q.z, q.w] }
    : { position: [p.x, p.y, p.z], rotation: [q.x, q.y, q.z, q.w] }
}
/** Inverse of toSceneSpace (used by the mock to produce wire-format frames). */
export function fromSceneSpace(j: Joint): RokokoJoint {
  const [x, y, z] = j.position
  const [qx, qy, qz, qw] = j.rotation
  return MIRROR_Z
    ? { position: { x, y, z: -z }, rotation: { x: -qx, y: -qy, z: qz, w: qw } }
    : { position: { x, y, z }, rotation: { x: qx, y: qy, z: qz, w: qw } }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isJoint = (j: unknown): j is RokokoJoint => {
  const o = j as RokokoJoint | undefined
  return (
    !!o &&
    isNum(o.position?.x) && isNum(o.position?.y) && isNum(o.position?.z) &&
    isNum(o.rotation?.x) && isNum(o.rotation?.y) && isNum(o.rotation?.z) && isNum(o.rotation?.w)
  )
}

/**
 * Parse one Rokoko frame (JSON text or an already-parsed object). Tolerant: unknown joints, props,
 * face and finger data are ignored, missing joints are skipped. Returns null if it isn't a frame.
 */
export function parseRokokoFrame(input: string | unknown): MocapFrame | null {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch {
      return null
    }
  }
  const f = raw as RokokoFrameV3 | undefined
  if (!f || typeof f !== 'object' || !f.scene || !Array.isArray(f.scene.actors)) return null
  const actors: MocapActor[] = f.scene.actors.map((a, i) => {
    const joints: MocapActor['joints'] = {}
    for (const name of JOINTS) {
      const j = a.body?.[name]
      if (isJoint(j)) joints[name] = toSceneSpace(j)
    }
    return { name: a.name ?? `Actor ${i + 1}`, joints }
  })
  return { timestamp: isNum(f.scene.timestamp) ? f.scene.timestamp : 0, fps: isNum(f.fps) ? f.fps : undefined, actors }
}
