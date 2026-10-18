/**
 * Script for the landing page's simulated VR replay. Everything is a pure function of the
 * playhead time (seconds), so the replay can be scrubbed, paused and restarted freely.
 * World units are metres; the viewer starts near +z looking toward −z.
 */
export type V2 = [number, number]
export type V3 = [number, number, number]

export const DURATION = 48

export const CHAPTERS = [
  { start: 0, title: 'Step into Empty Space', detail: 'Headset on — the empty hall opens around you at room scale.' },
  { start: 5, title: 'Raise the wrist menu', detail: 'Turn your left wrist up; the catalog follows your hand.' },
  { start: 10, title: 'Place props with the laser', detail: 'Point to preview the footprint, pull the trigger to drop it.' },
  { start: 20, title: 'Assign simulation roles', detail: 'Tag the entrance, registration, booths and exit.' },
  { start: 24, title: 'Start the virtual attendee', detail: 'Press Start — the attendee walks the venue entrance to exit.' },
  { start: 33, title: 'Drag a barrier into the walkway', detail: 'Squeeze grip and pull it across the path. The route replans.' },
  { start: 43, title: 'Save to your world library', detail: 'The venue is stored locally, ready to reopen or export.' },
] as const

export function chapterAt(t: number) {
  let i = 0
  for (let k = 0; k < CHAPTERS.length; k++) if (t >= CHAPTERS[k].start) i = k
  return i
}

export const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mix3 = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)]

/** Value between keyframes; `ease` smooths each segment (camera moves), otherwise linear (walking). */
export function sample<T extends number[]>(keys: readonly (readonly [number, T])[], t: number, ease = true): T {
  if (t <= keys[0][0]) return keys[0][1]
  for (let k = 1; k < keys.length; k++) {
    const [t1, v1] = keys[k]
    if (t <= t1) {
      const [t0, v0] = keys[k - 1]
      const f = (t - t0) / (t1 - t0 || 1)
      const e = ease ? smooth(f) : f
      return v0.map((v, i) => mix(v, v1[i], e)) as T
    }
  }
  return keys[keys.length - 1][1]
}

// ---- Venue layout -------------------------------------------------------------------------

export const ENTRANCE: V2 = [-6.5, 3.5]
export const EXIT: V2 = [6.8, 0.5]

export type PropKind = 'desk' | 'booth'
export type Placement = { id: string; kind: PropKind; at: V2; size: V2; color: string; placedAt: number; label: string }

/** Props dropped by the laser, in order. The ghost previews for ~2 s before each drop. */
export const PLACEMENTS: Placement[] = [
  { id: 'desk', kind: 'desk', at: [-3.5, 1.2], size: [1.8, 0.6], color: '#c4a574', placedAt: 12.4, label: 'REGISTRATION' },
  { id: 'booth-a', kind: 'booth', at: [-4, -3.2], size: [1.6, 1.2], color: '#e07845', placedAt: 14.8, label: 'BOOTH · ACME' },
  { id: 'booth-b', kind: 'booth', at: [0, -3.6], size: [1.6, 1.2], color: '#87b8b1', placedAt: 17.0, label: 'BOOTH · NOVA' },
  { id: 'booth-c', kind: 'booth', at: [4, -3.2], size: [1.6, 1.2], color: '#d6b25e', placedAt: 19.2, label: 'BOOTH · ORBIT' },
]
export const GHOST_LEAD = 2.1

/** Role tags popping in over the venue during the "assign roles" chapter. */
export const ROLE_TAGS: { at: V2; height: number; text: string; time: number }[] = [
  { at: ENTRANCE, height: 1.2, text: 'ENTRANCE', time: 20.8 },
  { at: [-3.5, 1.2], height: 1.6, text: 'REGISTRATION', time: 21.5 },
  { at: [-4, -3.2], height: 2.7, text: 'BOOTH', time: 22.1 },
  { at: [0, -3.6], height: 2.7, text: 'BOOTH', time: 22.5 },
  { at: [4, -3.2], height: 2.7, text: 'BOOTH', time: 22.9 },
  { at: EXIT, height: 1.2, text: 'EXIT', time: 23.5 },
]

// ---- Barrier ------------------------------------------------------------------------------

export const GRAB_START = 33.8
export const GRAB_END = 36.2
export const REPLAN_AT = 36.3
const BARRIER_FROM = { at: [3.4, 3.7] as V2, rot: 0.35 }
// Across the booth → exit walkway, broadside to the viewer so the block reads clearly.
const BARRIER_TO = { at: [3.4, -0.9] as V2, rot: 0 }
export const BARRIER_LENGTH = 3

export function barrierAt(t: number) {
  const k = smooth((t - GRAB_START - 0.4) / (GRAB_END - GRAB_START - 0.4))
  return {
    at: [mix(BARRIER_FROM.at[0], BARRIER_TO.at[0], k), mix(BARRIER_FROM.at[1], BARRIER_TO.at[1], k)] as V2,
    rot: mix(BARRIER_FROM.rot, BARRIER_TO.rot, k),
    lift: t > GRAB_START && t < GRAB_END + 0.2 ? 0.12 * Math.sin(Math.PI * smooth((t - GRAB_START) / (GRAB_END + 0.2 - GRAB_START))) : 0,
    held: t > GRAB_START && t < GRAB_END,
  }
}

// ---- Attendee -----------------------------------------------------------------------------

const REG_STOP: V2 = [-3.5, 2.1]
const BOOTH_STOP: V2 = [0, -2.3]
export const ROUTE_PLANNED: V2[] = [ENTRANCE, REG_STOP, [-1.5, 0.3], BOOTH_STOP, EXIT]
export const ROUTE_REPLANNED: V2[] = [BOOTH_STOP, [1.6, 1.4], [3.6, 1.9], EXIT]

const WALK: (readonly [number, V2])[] = [
  [25.8, ENTRANCE],
  [28.0, REG_STOP],
  [29.0, REG_STOP],
  [30.2, [-1.5, 0.3]],
  [31.6, BOOTH_STOP],
  [36.6, BOOTH_STOP],
  [38.6, [1.6, 1.4]],
  [40.0, [3.6, 1.9]],
  [42.2, EXIT],
]
export const ATTENDEE_START = WALK[0][0]
export const ATTENDEE_END = WALK[WALK.length - 1][0]

export function attendeeAt(t: number) {
  if (t < ATTENDEE_START - 0.4 || t > ATTENDEE_END + 0.8) return null
  const p = sample(WALK, t, false)
  const q = sample(WALK, t + 0.15, false)
  const dx = q[0] - p[0]
  const dz = q[1] - p[1]
  const moving = Math.hypot(dx, dz) > 1e-3
  const fade = Math.min(smooth((t - ATTENDEE_START + 0.4) / 0.4), 1 - smooth((t - ATTENDEE_END) / 0.8))
  return { at: p, heading: moving ? Math.atan2(dx, dz) : null, moving, fade }
}

export const pathLength = (pts: V2[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)

// ---- Viewer -------------------------------------------------------------------------------

/** Head position (y = eye height). The viewer takes a couple of steps into the hall. */
const HEAD: (readonly [number, V3])[] = [
  [0, [0, 1.62, 6.6]],
  [10, [0, 1.62, 6.6]],
  [13, [-0.6, 1.62, 5.6]],
  [20, [0.3, 1.62, 5.4]],
  [33, [0.6, 1.62, 5.2]],
  [37, [1.2, 1.62, 4.6]],
  [48, [1.2, 1.62, 4.6]],
]

/** Left hand (holding the wrist menu) relative to the head when the menu is up. */
const WRIST_OFFSET: V3 = [-0.22, -0.48, -0.42]
const MENU_WINDOWS: [number, number][] = [
  [5.6, 10.2],
  [24.0, 25.7],
  [43.0, 45.4],
]

export function menuRaise(t: number) {
  let r = 0
  for (const [a, b] of MENU_WINDOWS) r = Math.max(r, Math.min(smooth((t - a) / 0.6), 1 - smooth((t - b + 0.6) / 0.6)))
  return r
}

export const headAt = (t: number) => sample(HEAD, t)
export const wristAt = (t: number): V3 => {
  const h = headAt(t)
  const r = menuRaise(t)
  return [h[0] + WRIST_OFFSET[0], h[1] + mix(-0.95, WRIST_OFFSET[1], r), h[2] + WRIST_OFFSET[2]]
}

export const MENU_ITEMS = ['Desk', 'Booth', 'Barrier', '▶ Start attendee', 'Save world'] as const
/** Which wrist-menu row the laser is on (−1 = none) and whether it is being pressed. */
export function menuFocus(t: number): { item: number; pressed: boolean } {
  const press = (at: number) => t > at && t < at + 0.35
  if (t > 7 && t < 8.6) return { item: 1, pressed: false }
  if (t >= 8.6 && t < 10.2) return { item: 0, pressed: press(9.2) }
  if (t > 24.6 && t < 25.7) return { item: 3, pressed: press(25.0) }
  if (t > 43.7 && t < 45.4) return { item: 4, pressed: press(44.2) }
  return { item: -1, pressed: false }
}
export const SAVED_AT = 44.3

/** Approximate point on the wrist menu for a row; the scene snaps the beam to the rendered row. */
export function menuItemPoint(t: number, item: number): V3 {
  const w = wristAt(t)
  return [w[0] + 0.02, w[1] + 0.13 - item * 0.045, w[2] - 0.02]
}

const toV3 = ([x, z]: V2, y = 0): V3 => [x, y, z]
const ghostTarget = (t: number): V3 => {
  for (let i = 0; i < PLACEMENTS.length; i++) {
    const p = PLACEMENTS[i]
    if (t <= p.placedAt) {
      const from = i === 0 ? ([-1.5, 0, 3] as V3) : toV3(PLACEMENTS[i - 1].at)
      return mix3(from, toV3(p.at), smooth((t - (p.placedAt - GHOST_LEAD)) / (GHOST_LEAD - 0.5)))
    }
  }
  return toV3(PLACEMENTS[PLACEMENTS.length - 1].at)
}

/** The prop currently previewed under the laser, if any. */
export function ghostAt(t: number) {
  const p = PLACEMENTS.find((q) => t > q.placedAt - GHOST_LEAD && t <= q.placedAt)
  return p ? { placement: p, at: ghostTarget(t) } : null
}

/** Where the right-hand laser points, or null when it is off. */
export function laserAt(t: number): { target: V3; click: boolean } | null {
  const focus = menuFocus(t)
  if (focus.item >= 0) return { target: menuItemPoint(t, focus.item), click: focus.pressed }
  if (t > 10.4 && t < 19.4) {
    return { target: ghostTarget(t), click: PLACEMENTS.some((p) => t > p.placedAt && t < p.placedAt + 0.3) }
  }
  if (t > 20.4 && t < 23.9) {
    const tag = ROLE_TAGS.reduce((cur, r) => (t >= r.time - 0.5 ? r : cur), ROLE_TAGS[0])
    return { target: toV3(tag.at, 0.4), click: ROLE_TAGS.some((r) => t > r.time && t < r.time + 0.3) }
  }
  if (t > GRAB_START - 0.4 && t < GRAB_END) {
    const b = barrierAt(t)
    return { target: [b.at[0], 0.9 + b.lift, b.at[1]], click: false }
  }
  return null
}

/** Where the viewer looks. Mostly follows the action; glances at the wrist when the menu is up. */
const GAZE: (readonly [number, V3])[] = [
  [0, [0, 1.3, 0]],
  [2.6, [-3.5, 1.1, 0]],
  [4.6, [3, 1.1, -1]],
  [6.4, [-0.25, 0.95, 6.0]],
  [9.8, [-0.25, 0.95, 6.0]],
  [11.4, [-3.5, 0.3, 1.4]],
  [13, [-3.5, 0.3, 1.2]],
  [14.6, [-4, 0.4, -3]],
  [16.8, [0, 0.4, -3.4]],
  [19.0, [4, 0.4, -3]],
  [20.8, [-6, 0.5, 3.4]],
  [22.5, [0, 0.8, -3]],
  [23.6, [6.4, 0.5, 0.6]],
  [24.6, [0.05, 0.95, 4.95]],
  [25.5, [0.05, 0.95, 4.95]],
  [26.6, [-5.6, 0.7, 3]],
  [28.6, [-3.5, 0.8, 1.8]],
  [31.6, [0, 0.8, -2.2]],
  [33.4, [3.4, 0.6, 3.7]],
  [36.2, [3.4, 0.5, -0.9]],
  [38.6, [1.8, 0.7, 1.3]],
  [42.4, [6.4, 0.7, 0.6]],
  [43.8, [0.95, 0.95, 4.15]],
  [45.4, [0.95, 0.95, 4.15]],
  [47, [0, 1.2, -2]],
]

/** Look target, nudged toward the live wrist position while the menu is raised. */
export function gazeAt(t: number): V3 {
  const g = sample(GAZE, t)
  const r = menuRaise(t)
  if (r <= 0) return g
  const w = wristAt(t)
  return mix3(g, [w[0], w[1] + 0.05, w[2]], r * 0.85)
}
