import { describe, expect, it } from 'vitest'
import { LinearResampler, float32ToPcm16 } from '../pcmResampler'

describe('LinearResampler', () => {
  it('passes through when rates match', () => {
    const r = new LinearResampler(16000, 16000)
    const input = new Float32Array([0, 0.5, -0.5, 1])
    expect(r.process(input)).toEqual(input)
  })

  it('downsamples 48 kHz toward 16 kHz (about 1/3 the samples)', () => {
    const r = new LinearResampler(48000, 16000)
    const input = new Float32Array(480)
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 20)
    const out = r.process(input)
    expect(out.length).toBeGreaterThan(140)
    expect(out.length).toBeLessThan(180)
  })
})

describe('float32ToPcm16', () => {
  it('encodes little-endian int16', () => {
    const buf = float32ToPcm16(new Float32Array([0, 1, -1]))
    const view = new DataView(buf)
    expect(view.getInt16(0, true)).toBe(0)
    expect(view.getInt16(2, true)).toBe(0x7fff)
    expect(view.getInt16(4, true)).toBe(-0x8000)
  })
})
