import { getWebXRManager } from './session'

/**
 * Controller haptics (Quest Touch / Touch Plus). Hands have none; they keep the visual feedback.
 *
 * `target: 'active'` buzzes the controller that is doing the action, i.e. the one with its trigger or
 * grip held, so a grab, snap tick or button press is felt in the hand that made it.
 */
export type HapticTarget = 'active' | 'left' | 'right' | 'both'

/** Feel presets: [strength 0–1, milliseconds]. */
export const HAPTIC = {
  tick: [0.2, 12],
  press: [0.35, 20],
  grab: [0.45, 30],
  place: [0.6, 45],
  commit: [0.7, 60],
  delete: [0.9, 35],
} as const satisfies Record<string, readonly [number, number]>

interface PulseSource {
  handedness: XRHandedness
  hand?: unknown
  gamepad?: { buttons: readonly { pressed?: boolean; value?: number }[]; hapticActuators?: readonly unknown[] } | null
}

/** Which input sources a pulse goes to (pure, so it's unit-tested). Hands and pads without actuators are skipped. */
export function pulseTargets<T extends PulseSource>(sources: Iterable<T>, target: HapticTarget): T[] {
  const pads = [...sources].filter((s) => !s.hand && (s.gamepad?.hapticActuators?.length ?? 0) > 0)
  if (target === 'both') return pads
  if (target === 'left' || target === 'right') return pads.filter((s) => s.handedness === target)
  const busy = (s: T) => [0, 1].some((i) => s.gamepad?.buttons[i]?.pressed || (s.gamepad?.buttons[i]?.value ?? 0) > 0.5)
  return pads.filter(busy)
}

/** Buzz controllers. Safe to call anywhere: outside XR, with hands, or without actuators it does nothing. */
export function pulse(target: HapticTarget, [strength, ms]: readonly [number, number] = HAPTIC.tick) {
  const session = getWebXRManager()?.getSession()
  if (!session) return
  for (const source of pulseTargets(session.inputSources as Iterable<XRInputSource & PulseSource>, target)) {
    const actuator = source.gamepad?.hapticActuators?.[0] as { pulse?: (v: number, d: number) => Promise<boolean> } | undefined
    void actuator?.pulse?.(strength, ms)?.catch?.(() => {})
  }
}

/** Delete feel: two strong, quick buzzes, so it never reads as a press or a placement. */
export function pulseDelete(target: HapticTarget = 'both') {
  pulse(target, HAPTIC.delete)
  setTimeout(() => pulse(target, HAPTIC.delete), 90)
}

/** Whether any controller has B or Y held (xr-standard button 5). Hands have no buttons. */
export function secondaryPressed(sources: Iterable<PulseSource> | undefined): boolean {
  if (!sources) return false
  return [...sources].some((s) => !s.hand && !!s.gamepad?.buttons[5]?.pressed)
}
