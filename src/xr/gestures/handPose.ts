/**
 * Hand pose features from WebXR hand joints (pure: no three.js, no XR objects, so it's unit-testable).
 *
 * Positions are metres in one shared space (the XR reference space). Joint names are the WebXR Hand
 * Input names (`wrist`, `thumb-tip`, `index-finger-phalanx-proximal`, …).
 */
export type V3 = [number, number, number]
export type Joints = Partial<Record<string, V3>>
export type Handedness = 'left' | 'right'

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2])
export const dist = (a: V3, b: V3) => len(sub(a, b))
export const norm = (a: V3): V3 => {
  const l = len(a)
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0]
}
export const mid = (a: V3, b: V3): V3 => scale(add(a, b), 0.5)
const angleDeg = (a: V3, b: V3) => (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const
type Finger = (typeof FINGERS)[number]

/** Joints every feature needs. A hand missing any of them (tracking dropout) yields no features. */
export const REQUIRED_JOINTS = [
  'wrist',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  ...FINGERS.flatMap((f) => [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]),
]

/** Tunable thresholds (see docs/gestures.md). */
export const POSE = {
  /** A finger chain at least this straight (end-to-end ÷ bone lengths) counts as extended… */
  extended: 0.9,
  /** …and at most this straight as curled. In between is "neither", so poses don't flicker. */
  curled: 0.78,
  /** Pinch: thumb tip to index tip, start below / release above (hysteresis is in the recognizer). */
  pinchStart: 0.02,
  pinchEnd: 0.035,
  /** L: angle between thumb and index directions, degrees. */
  lMinDeg: 55,
  lMaxDeg: 125,
}

export interface HandFeatures {
  handedness: Handedness
  /** Thumb tip ↔ index tip, metres. */
  pinchDistance: number
  /** Midpoint of thumb and index tips: where a pinch "is". */
  pinchPoint: V3
  /** Straightness 0…1 per finger (1 = fully straight). */
  straightness: Record<Finger | 'thumb', number>
  /** Index pointing direction (proximal → tip), unit. */
  indexDir: V3
  /** Thumb direction (proximal → tip), unit. */
  thumbDir: V3
  /** Angle between thumb and index, degrees. */
  lAngle: number
  /** The L's corner: between the thumb and index bases (the "crotch" of the hand). */
  corner: V3
  /** Unit normal out of the palm. */
  palmNormal: V3
  /** Unit wrist → middle-knuckle direction (the hand's forward axis, used for wrist roll). */
  forward: V3
  wrist: V3
}

function chainStraightness(j: Joints, names: string[]): number {
  let bones = 0
  for (let i = 1; i < names.length; i++) bones += dist(j[names[i - 1]]!, j[names[i]]!)
  return bones > 1e-6 ? dist(j[names[0]]!, j[names[names.length - 1]]!) / bones : 0
}

/** Features for one hand, or null if tracking is missing joints. */
export function handFeatures(joints: Joints, handedness: Handedness): HandFeatures | null {
  for (const n of REQUIRED_JOINTS) if (!joints[n]) return null
  const j = joints as Record<string, V3>
  const straightness = {
    thumb: chainStraightness(j, ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']),
  } as HandFeatures['straightness']
  for (const f of FINGERS)
    straightness[f] = chainStraightness(j, [`${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`])

  const indexDir = norm(sub(j['index-finger-tip'], j['index-finger-phalanx-proximal']))
  const thumbDir = norm(sub(j['thumb-tip'], j['thumb-phalanx-proximal']))
  const wrist = j['wrist']
  const forward = norm(sub(j['middle-finger-phalanx-proximal'], wrist))
  // Palm normal from the knuckle line; flip for the left hand so it always points out of the palm.
  const across = sub(j['pinky-finger-phalanx-proximal'], j['index-finger-phalanx-proximal'])
  const n = norm(cross(forward, across))
  const palmNormal: V3 = handedness === 'right' ? n : scale(n, -1)

  return {
    handedness,
    pinchDistance: dist(j['thumb-tip'], j['index-finger-tip']),
    pinchPoint: mid(j['thumb-tip'], j['index-finger-tip']),
    straightness,
    indexDir,
    thumbDir,
    lAngle: angleDeg(indexDir, thumbDir),
    corner: mid(j['thumb-phalanx-proximal'], j['index-finger-phalanx-proximal']),
    palmNormal,
    forward,
    wrist,
  }
}

const curled = (s: number) => s <= POSE.curled
const extended = (s: number) => s >= POSE.extended

/** Index and thumb out at roughly a right angle, the other three fingers curled. */
export function isL(f: HandFeatures): boolean {
  const s = f.straightness
  return (
    extended(s['index-finger']) &&
    extended(s.thumb) &&
    curled(s['middle-finger']) &&
    curled(s['ring-finger']) &&
    curled(s['pinky-finger']) &&
    f.lAngle >= POSE.lMinDeg &&
    f.lAngle <= POSE.lMaxDeg &&
    f.pinchDistance > POSE.pinchEnd
  )
}

/** All four fingers curled and the thumb not sticking out. */
export function isFist(f: HandFeatures): boolean {
  const s = f.straightness
  return curled(s['index-finger']) && curled(s['middle-finger']) && curled(s['ring-finger']) && curled(s['pinky-finger']) && !extended(s.thumb)
}

/**
 * Signed wrist roll from `n0` to `n` (palm normals) about the hand's forward axis, radians.
 * Positive is counter-clockwise looking along `axis` from the wrist toward the fingers.
 */
export function rollAngle(n0: V3, n: V3, axis: V3): number {
  const a = norm(axis)
  const p0 = norm(sub(n0, scale(a, dot(n0, a))))
  const p1 = norm(sub(n, scale(a, dot(n, a))))
  return Math.atan2(dot(cross(p0, p1), a), dot(p0, p1))
}
