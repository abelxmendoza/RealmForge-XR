import { describe, expect, it } from 'vitest'
import { BARRIER_LENGTH, CHAPTERS, DURATION, PLACEMENTS, REPLAN_AT, ROUTE_REPLANNED, attendeeAt, barrierAt, chapterAt, ghostAt, laserAt, type V2 } from './timeline'

const cross = (a: V2, b: V2, c: V2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const intersects = (p1: V2, p2: V2, q1: V2, q2: V2) =>
  cross(p1, p2, q1) * cross(p1, p2, q2) < 0 && cross(q1, q2, p1) * cross(q1, q2, p2) < 0

describe('VR demo timeline', () => {
  it('chapters are ordered and inside the replay', () => {
    CHAPTERS.forEach((c, i) => {
      expect(c.start).toBeLessThan(DURATION)
      if (i) expect(c.start).toBeGreaterThan(CHAPTERS[i - 1].start)
      expect(chapterAt(c.start + 0.01)).toBe(i)
    })
  })

  it('previews each prop under the laser before it drops', () => {
    for (const p of PLACEMENTS) {
      const t = p.placedAt - 0.1
      expect(ghostAt(t)?.placement.id).toBe(p.id)
      expect(laserAt(t)).not.toBeNull()
    }
  })

  it('the replanned route goes around the dropped barrier', () => {
    // Same orientation the scene uses: rotation.y = −rot puts the barrier along (cos rot, sin rot).
    const b = barrierAt(REPLAN_AT)
    const half: V2 = [(Math.cos(b.rot) * BARRIER_LENGTH) / 2, (Math.sin(b.rot) * BARRIER_LENGTH) / 2]
    const ends: [V2, V2] = [
      [b.at[0] - half[0], b.at[1] - half[1]],
      [b.at[0] + half[0], b.at[1] + half[1]],
    ]
    for (let i = 1; i < ROUTE_REPLANNED.length; i++) expect(intersects(ROUTE_REPLANNED[i - 1], ROUTE_REPLANNED[i], ...ends)).toBe(false)
    expect(intersects(ROUTE_REPLANNED[0], ROUTE_REPLANNED[ROUTE_REPLANNED.length - 1], ...ends)).toBe(true)
  })

  it('the attendee only appears while the simulation runs', () => {
    expect(attendeeAt(10)).toBeNull()
    expect(attendeeAt(30)?.moving).toBe(true)
    expect(attendeeAt(DURATION)).toBeNull()
  })
})
