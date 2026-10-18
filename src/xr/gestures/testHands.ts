import { add, cross, norm, scale, type Handedness, type Joints, type V3 } from './handPose'

/**
 * Synthetic WebXR hand skeletons for tests (roughly adult proportions). Not used by the app.
 *
 * `forward` is where the fingers point; `up` is out of the back of the hand. The thumb side follows
 * handedness (right hand: cross(up, forward)), like a real hand.
 */
export type TestPose = 'open' | 'fist' | 'pinch' | 'L'

export interface TestHand {
  handedness: Handedness
  pose: TestPose
  wrist?: V3
  forward?: V3
  up?: V3
  /** Thumb–index angle for the L pose (degrees). */
  lAngle?: number
}

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const
const LATERAL = [0.03, 0.01, -0.01, -0.03] // along the thumb side: index nearest the thumb
const BONES = [0.045, 0.025, 0.02]

export function makeHand(h: TestHand): Joints {
  const wrist = h.wrist ?? [0, 1.2, -0.3]
  const f = norm(h.forward ?? [0, 0, -1])
  const u = norm(h.up ?? [0, 1, 0])
  const sideRight = norm(cross(u, f))
  const t = h.handedness === 'right' ? sideRight : scale(sideRight, -1)
  const at = (...terms: [V3, number][]) => terms.reduce<V3>((p, [v, k]) => add(p, scale(v, k)), wrist)
  const j: Joints = { wrist }

  FINGERS.forEach((name, i) => {
    j[`${name}-metacarpal`] = at([f, 0.03], [t, LATERAL[i]])
    const prox = at([f, 0.09], [t, LATERAL[i]])
    j[`${name}-phalanx-proximal`] = prox
    const curl = h.pose === 'fist' || (h.pose === 'L' && i > 0)
    const dirs: V3[] = curl
      ? [norm(add(scale(f, 0.2), scale(u, -1))), norm(add(scale(f, -0.6), scale(u, -0.5))), norm(add(scale(f, -1), scale(u, 0.3)))]
      : [f, f, f]
    let p = prox
    const names = ['phalanx-intermediate', 'phalanx-distal', 'tip']
    dirs.forEach((d, k) => {
      p = add(p, scale(d, BONES[k]))
      j[`${name}-${names[k]}`] = p
    })
  })

  const thumbProx = at([f, 0.04], [t, 0.04])
  j['thumb-metacarpal'] = at([f, 0.02], [t, 0.02])
  j['thumb-phalanx-proximal'] = thumbProx
  if (h.pose === 'pinch') {
    const tip = add(j['index-finger-tip']!, scale(t, 0.005))
    j['thumb-tip'] = tip
    j['thumb-phalanx-distal'] = scale(add(thumbProx, tip), 0.5)
  } else if (h.pose === 'fist') {
    const distal = add(thumbProx, scale(norm(add(f, scale(u, -1))), 0.035))
    j['thumb-phalanx-distal'] = distal
    j['thumb-tip'] = add(distal, scale(norm(add(scale(t, -1), scale(u, -0.3))), 0.03))
  } else {
    const a = ((h.pose === 'L' ? (h.lAngle ?? 90) : 30) * Math.PI) / 180
    const d = norm(add(scale(f, Math.cos(a)), scale(t, Math.sin(a))))
    const distal = add(thumbProx, scale(d, 0.035))
    j['thumb-phalanx-distal'] = distal
    j['thumb-tip'] = add(distal, scale(d, 0.03))
  }
  return j
}

/** The photographer's "frame" pair: left L at bottom-left (index up, thumb right), right L at top-right (index down, thumb left). */
export function framePair(center: V3 = [0, 1.3, -0.45], span = 0.3): { left: Joints; right: Joints } {
  const h = span / 2
  return {
    left: makeHand({ handedness: 'left', pose: 'L', wrist: [center[0] - h, center[1] - h - 0.09, center[2]], forward: [0, 1, 0], up: [0, 0, 1] }),
    right: makeHand({ handedness: 'right', pose: 'L', wrist: [center[0] + h, center[1] + h + 0.09, center[2]], forward: [0, -1, 0], up: [0, 0, -1] }),
  }
}
