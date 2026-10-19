/**
 * One press per touch. A pointer that pressed must lift (pointer up / leave the panel) before it can press
 * again, and the whole panel ignores presses for `cooldownMs` after one (a ray and a fingertip touching the same
 * button together). Short enough that two deliberate taps on different buttons both count.
 *
 * Why: XR presses fire on pointer *down* (touch pointers only emit click for quick pokes). Without this, a
 * fingertip or ray resting on a button that opens another page would also press whatever button of the new
 * page lands under it, which is how "Back" and page buttons seemed to skip or bounce in the headset.
 */
export class PressGate {
  private readonly down = new Set<number>()
  private last = -Infinity

  constructor(private readonly cooldownMs = 150) {}

  /** A pointer went down at `now` (ms). Returns whether this counts as a press. */
  press(pointerId: number, now: number): boolean {
    if (this.down.has(pointerId)) return false
    this.down.add(pointerId)
    if (now - this.last < this.cooldownMs) return false
    this.last = now
    return true
  }

  /** A pointer went down on nothing pressable: it still has to lift before it can press. */
  hold(pointerId: number) {
    this.down.add(pointerId)
  }

  /** Pointer lifted or left: it may press again. */
  release(pointerId: number) {
    this.down.delete(pointerId)
  }

  /** When the panel is hidden or remounts, forget held pointers (their up events may never arrive). */
  reset() {
    this.down.clear()
  }

  /** Milliseconds since the last accepted press (for the brief pressed look). */
  sinceLast(now: number) {
    return now - this.last
  }
}
