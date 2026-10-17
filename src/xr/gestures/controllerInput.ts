import { dist, norm, type HandFeatures, type Handedness, type V3 } from './handPose'
import { DWELL, type GestureEvent } from './recognizer'

/**
 * Controller equivalents of the hand gestures (Quest Touch / Touch Plus, `xr-standard` gamepad mapping),
 * so everything also works with controllers. Same actions, same dwell-before-act rule:
 *
 * | Controller                       | Hand gesture equivalent / action            |
 * | -------------------------------- | -------------------------------------------- |
 * | both grips (in empty air)        | two-fist world pull                          |
 * | both triggers, hold              | frame select (between the controllers)       |
 * | hold A, aim the right controller | L: set the primary axis                      |
 * | right trigger at a distance      | pinch: select; twist the controller to turn  |
 * | right stick ← → (holding)        | rotate the held selection 15° per flick      |
 * | right stick ← → (otherwise)      | snap turn 30°                                |
 * | left stick                       | move through the world (smooth, true scale)  |
 *
 * Pure and time-driven, so it is unit-tested without a headset.
 */

/** One controller this frame: pose (from its grip and target-ray spaces) and gamepad state. */
export interface ControllerSample {
  handedness: Handedness
  /** Grip position (where your hand is). */
  grip: V3
  /** Grip orientation axes in world space: up (+Y) and forward (−Z). */
  up: V3
  forward: V3
  /** Target ray (pointing direction) origin and direction. */
  rayOrigin: V3
  rayDir: V3
  trigger: number
  squeeze: number
  /** A on the right controller, X on the left. */
  primary: boolean
  /** Thumbstick x (right +) and y (forward −, the gamepad convention). */
  stick: [number, number]
}

export const CONTROLS = {
  pressed: 0.6,
  released: 0.35,
  /** Stick deflection that counts as a flick (and must return below `stickRelease` to flick again). */
  stickFlick: 0.7,
  stickRelease: 0.3,
  stickDeadzone: 0.15,
  /** Smooth locomotion speed, metres per second in the room. */
  moveSpeed: 1.5,
  snapTurn: Math.PI / 6,
  rotateStep: Math.PI / 12,
}

/** The fields the gesture actions read, filled from a controller (so the same actions handle both). */
export function controllerFeatures(c: ControllerSample): HandFeatures {
  return {
    handedness: c.handedness,
    pinchDistance: 1,
    pinchPoint: c.grip,
    straightness: { thumb: 1, 'index-finger': 1, 'middle-finger': 1, 'ring-finger': 1, 'pinky-finger': 1 },
    indexDir: norm(c.rayDir),
    thumbDir: norm(c.up),
    lAngle: 90,
    corner: c.grip,
    palmNormal: norm(c.up),
    forward: norm(c.forward),
    wrist: c.grip,
  }
}

/** Extra events only controllers produce. */
export type ControllerEvent =
  | GestureEvent
  | { type: 'move'; x: number; z: number } // metres to move *you* this frame: x right, z forward (head-relative)
  | { type: 'turn'; yaw: number }
  | { type: 'rotate-step'; yaw: number }

const held = (v: number, wasHeld: boolean) => (wasHeld ? v > CONTROLS.released : v > CONTROLS.pressed)

export class ControllerRecognizer {
  private grip = { left: false, right: false }
  private trig = { left: false, right: false }
  private pulling = false
  private frameSince: number | null = null
  private frameFired = false
  private aSince: number | null = null
  private aFired = false
  private selecting = false
  private flicked = false

  /**
   * One frame. `dt` in seconds. `blocked[hand]` = that controller is near-grabbing an object or pressing
   * the wrist menu: it starts nothing new. `rays` = pointer rays are on (they own the trigger then).
   */
  update(t: number, dt: number, left: ControllerSample | null, right: ControllerSample | null, blocked: Record<Handedness, boolean>, rays: boolean): ControllerEvent[] {
    const out: ControllerEvent[] = []
    const g = { left: !!left && held(left.squeeze, this.grip.left), right: !!right && held(right.squeeze, this.grip.right) }
    const tr = { left: !!left && held(left.trigger, this.trig.left), right: !!right && held(right.trigger, this.trig.right) }
    const gripStarted = { left: g.left && !this.grip.left, right: g.right && !this.grip.right }
    this.grip = g
    this.trig = tr

    // Both grips in empty air → world pull. Starting requires both to be free (a grip on an object is a near grab).
    if (this.pulling) {
      if (g.left && g.right && left && right) out.push({ type: 'pull-move', left: controllerFeatures(left), right: controllerFeatures(right) })
      else {
        this.pulling = false
        out.push(left && right ? { type: 'pull-end', left: controllerFeatures(left), right: controllerFeatures(right) } : { type: 'cancel' })
      }
    } else if (g.left && g.right && (gripStarted.left || gripStarted.right) && !blocked.left && !blocked.right && left && right) {
      this.pulling = true
      out.push({ type: 'pull-start', left: controllerFeatures(left), right: controllerFeatures(right) })
    }

    // Both triggers held → frame select (rays off: with rays on the triggers point and click instead).
    const framing = !rays && tr.left && tr.right && !!left && !!right && !blocked.left && !blocked.right && dist(left.grip, right.grip) > 0.1
    if (framing) {
      if (this.selecting) {
        this.selecting = false
        out.push({ type: 'pinch-end', hand: 'right', f: controllerFeatures(right!) })
      }
      this.frameSince ??= t
      const progress = Math.min(1, (t - this.frameSince) / DWELL.frame)
      out.push({ type: 'frame-progress', progress, a: left!.grip, b: right!.grip })
      if (progress >= 1 && !this.frameFired) {
        this.frameFired = true
        out.push({ type: 'frame', a: left!.grip, b: right!.grip })
      }
    } else {
      this.frameSince = null
      this.frameFired = false
    }

    if (right) {
      const f = controllerFeatures(right)
      // Hold A → primary axis along the right controller's pointing direction.
      if (right.primary && !blocked.right) {
        this.aSince ??= t
        const progress = Math.min(1, (t - this.aSince) / DWELL.l)
        if (!this.aFired) out.push({ type: 'l-progress', hand: 'right', progress, f })
        if (progress >= 1 && !this.aFired) {
          this.aFired = true
          out.push({ type: 'l-hold', hand: 'right', f })
        }
      } else {
        this.aSince = null
        this.aFired = false
      }

      // Right trigger alone (rays off) → select at a distance; twist to turn (handled like a pinch).
      if (!framing && !rays) {
        if (this.selecting && !tr.right) {
          this.selecting = false
          out.push({ type: 'pinch-end', hand: 'right', f })
        } else if (this.selecting) out.push({ type: 'pinch-move', hand: 'right', f })
        else if (tr.right && !tr.left && !blocked.right) {
          this.selecting = true
          out.push({ type: 'pinch-start', hand: 'right', f })
        }
      }

      // Right stick flick: rotate the held selection, or snap turn.
      const x = right.stick[0]
      if (!this.flicked && Math.abs(x) > CONTROLS.stickFlick) {
        this.flicked = true
        const dir = Math.sign(x)
        out.push(this.selecting ? { type: 'rotate-step', yaw: -dir * CONTROLS.rotateStep } : { type: 'turn', yaw: -dir * CONTROLS.snapTurn })
      } else if (this.flicked && Math.abs(x) < CONTROLS.stickRelease) this.flicked = false
    } else if (this.selecting) {
      this.selecting = false
      out.push({ type: 'cancel' })
    }

    // Left stick → smooth locomotion (not while pulling the world by hand).
    if (left && !this.pulling) {
      const [sx, sy] = left.stick
      if (Math.hypot(sx, sy) > CONTROLS.stickDeadzone) out.push({ type: 'move', x: sx * CONTROLS.moveSpeed * dt, z: -sy * CONTROLS.moveSpeed * dt })
    }
    return out
  }
}
