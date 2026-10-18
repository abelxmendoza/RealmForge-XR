import { POSE, dist, dot, isFist, isL, type HandFeatures, type Handedness, type V3 } from './handPose'

/**
 * Turns per-frame hand features into gesture events, following the g-speak / Minority Report pattern
 * pose → hold (dwell) → act → release: a pose has to be held briefly before anything happens, so normal
 * hand movement never triggers commands (the "Midas touch" problem). Two-handed gestures take priority
 * over one-handed ones. Pure and time-driven (pass seconds), so it is unit-tested with synthetic hands.
 */
export const DWELL = {
  /** L pose held this long sets the world's primary axis. */
  l: 0.7,
  /** Two-hand frame held this long selects what's inside it. */
  frame: 0.4,
}

/** Two L-hands make a frame when their corners are this far apart (m) and the hands mirror each other. */
const FRAME_MIN_SPAN = 0.1
const FRAME_MAX_SPAN = 0.9

export type GestureEvent =
  | { type: 'pinch-start' | 'pinch-move' | 'pinch-end'; hand: Handedness; f: HandFeatures }
  | { type: 'l-progress'; hand: Handedness; progress: number; f: HandFeatures }
  | { type: 'l-hold'; hand: Handedness; f: HandFeatures }
  | { type: 'frame-progress'; progress: number; a: V3; b: V3 }
  | { type: 'frame'; a: V3; b: V3 }
  | { type: 'pull-start' | 'pull-move' | 'pull-end'; left: HandFeatures; right: HandFeatures }
  | { type: 'cancel' }

interface HandState {
  pinching: boolean
  lSince: number | null
  lFired: boolean
}

/** Whether two L-hands form a frame: corners well apart, index fingers pointing opposite ways. */
export function isFramePair(l: HandFeatures, r: HandFeatures): boolean {
  if (!isL(l) || !isL(r)) return false
  const span = dist(l.corner, r.corner)
  if (span < FRAME_MIN_SPAN || span > FRAME_MAX_SPAN) return false
  // Opposite corners of a rectangle: the two index fingers (and thumbs) point roughly opposite ways.
  return dot(l.indexDir, r.indexDir) < -0.3 && dot(l.thumbDir, r.thumbDir) < -0.3
}

export class GestureRecognizer {
  private hands: Record<Handedness, HandState> = {
    left: { pinching: false, lSince: null, lFired: false },
    right: { pinching: false, lSince: null, lFired: false },
  }
  private frameSince: number | null = null
  private frameFired = false
  private pulling = false
  private last: { left: HandFeatures | null; right: HandFeatures | null } = { left: null, right: null }

  /**
   * One frame. `blocked[hand]` = that hand is busy (touching an object, using the wrist menu): it starts
   * nothing new, but gestures already running still finish cleanly.
   */
  update(t: number, left: HandFeatures | null, right: HandFeatures | null, blocked: Record<Handedness, boolean> = { left: false, right: false }): GestureEvent[] {
    const out: GestureEvent[] = []
    this.last = { left, right }

    // --- Two-handed: world pull (both fists) takes priority over everything.
    const bothFists = !!left && !!right && isFist(left) && isFist(right)
    if (this.pulling) {
      if (bothFists) out.push({ type: 'pull-move', left: left!, right: right! })
      else {
        this.pulling = false
        out.push(this.last.left && this.last.right ? { type: 'pull-end', left: this.last.left, right: this.last.right } : { type: 'cancel' })
      }
      if (this.pulling) return out
    } else if (bothFists && !blocked.left && !blocked.right) {
      this.endOneHanded(out)
      this.pulling = true
      out.push({ type: 'pull-start', left: left!, right: right! })
      return out
    }

    // --- Two-handed: frame (both L, mirrored) → select what's inside.
    const framing = !!left && !!right && !blocked.left && !blocked.right && isFramePair(left, right)
    if (framing) {
      this.endOneHanded(out)
      this.frameSince ??= t
      const progress = Math.min(1, (t - this.frameSince) / DWELL.frame)
      out.push({ type: 'frame-progress', progress, a: left!.corner, b: right!.corner })
      if (progress >= 1 && !this.frameFired) {
        this.frameFired = true
        out.push({ type: 'frame', a: left!.corner, b: right!.corner })
      }
      return out
    }
    if (this.frameSince !== null) {
      this.frameSince = null
      this.frameFired = false
    }

    // --- One-handed, per hand.
    for (const hand of ['left', 'right'] as const) {
      const f = hand === 'left' ? left : right
      const s = this.hands[hand]
      if (!f) {
        if (s.pinching) {
          s.pinching = false
          out.push({ type: 'cancel' })
        }
        s.lSince = null
        s.lFired = false
        continue
      }
      // Pinch with hysteresis.
      if (s.pinching) {
        if (f.pinchDistance > POSE.pinchEnd) {
          s.pinching = false
          out.push({ type: 'pinch-end', hand, f })
        } else out.push({ type: 'pinch-move', hand, f })
      } else if (!blocked[hand] && f.pinchDistance < POSE.pinchStart) {
        s.pinching = true
        out.push({ type: 'pinch-start', hand, f })
      }
      // L hold (not while pinching).
      if (!s.pinching && !blocked[hand] && isL(f)) {
        s.lSince ??= t
        const progress = Math.min(1, (t - s.lSince) / DWELL.l)
        if (!s.lFired) out.push({ type: 'l-progress', hand, progress, f })
        if (progress >= 1 && !s.lFired) {
          s.lFired = true
          out.push({ type: 'l-hold', hand, f })
        }
      } else {
        s.lSince = null
        s.lFired = false
      }
    }
    return out
  }

  /** A two-handed gesture took over: end any pinch and reset L timers. */
  private endOneHanded(out: GestureEvent[]) {
    for (const hand of ['left', 'right'] as const) {
      const s = this.hands[hand]
      const f = this.last[hand]
      if (s.pinching) {
        s.pinching = false
        out.push(f ? { type: 'pinch-end', hand, f } : { type: 'cancel' })
      }
      s.lSince = null
      s.lFired = false
    }
  }
}
