import { describe, expect, it } from 'vitest'
import { BONES, JOINTS, fromSceneSpace, parseRokokoFrame, toSceneSpace, type Joint } from './rokoko'
import { mockFrame, mockJoints } from './mock'

describe('parseRokokoFrame', () => {
  it('parses a JSON v3 frame (from the mock) into every body joint', () => {
    const frame = parseRokokoFrame(JSON.stringify(mockFrame(1.25)))!
    expect(frame).not.toBeNull()
    expect(frame.fps).toBe(60)
    expect(frame.actors).toHaveLength(1)
    const actor = frame.actors[0]
    expect(actor.name).toBe('Mock actor')
    for (const name of JOINTS) expect(actor.joints[name]).toBeDefined()
    // Metres, Y up: head above hips above feet, about human height.
    const y = (n: (typeof JOINTS)[number]) => actor.joints[n]!.position[1]
    expect(y('head')).toBeGreaterThan(y('hip'))
    expect(y('hip')).toBeGreaterThan(y('leftFoot'))
    expect(y('head')).toBeGreaterThan(1.4)
    expect(y('head')).toBeLessThan(2)
  })

  it('round-trips the mock: parsed joints equal the scene-space pose it was built from', () => {
    const t = 3.7
    const parsed = parseRokokoFrame(mockFrame(t))!.actors[0].joints
    const expected = mockJoints(t)
    for (const name of JOINTS) {
      parsed[name]!.position.forEach((v, i) => expect(v).toBeCloseTo(expected[name].position[i]))
    }
  })

  it('skips missing or malformed joints and ignores unknown data', () => {
    const frame = parseRokokoFrame({
      version: 3,
      scene: {
        actors: [
          {
            body: {
              hip: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
              head: { position: { x: 0, y: 'tall', z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
              leftThumbProximal: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
            },
            face: { jawOpen: 0.2 },
          },
        ],
        props: [{ name: 'stick' }],
      },
    })!
    expect(Object.keys(frame.actors[0].joints)).toEqual(['hip'])
    expect(frame.actors[0].name).toBe('Actor 1')
  })

  it('returns null for things that are not frames', () => {
    expect(parseRokokoFrame('not json')).toBeNull()
    expect(parseRokokoFrame('{"hello":1}')).toBeNull()
    expect(parseRokokoFrame(null)).toBeNull()
  })
})

describe('axis conversion', () => {
  it('toSceneSpace and fromSceneSpace are inverses', () => {
    const j: Joint = { position: [0.3, 1.2, -0.7], rotation: [0.1, 0.2, 0.3, 0.927] }
    const back = toSceneSpace(fromSceneSpace(j))
    back.position.forEach((v, i) => expect(v).toBeCloseTo(j.position[i]))
    back.rotation.forEach((v, i) => expect(v).toBeCloseTo(j.rotation[i]))
  })

  it('every bone connects two known joints', () => {
    for (const [a, b] of BONES) {
      expect(JOINTS).toContain(a)
      expect(JOINTS).toContain(b)
    }
  })
})
