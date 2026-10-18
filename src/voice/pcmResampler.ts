/**
 * Linear-interpolation resampler for mic PCM → AssemblyAI's 16 kHz expectation.
 * Browsers (especially Safari / some laptops) ignore AudioContext({ sampleRate: 16000 }).
 */

export class LinearResampler {
  private readonly ratio: number
  private lastSample = 0
  private fractional = 0

  constructor(
    private readonly sourceRate: number,
    private readonly targetRate: number,
  ) {
    if (sourceRate <= 0 || targetRate <= 0) throw new Error('sample rates must be positive')
    this.ratio = sourceRate / targetRate
  }

  process(input: Float32Array): Float32Array {
    if (this.sourceRate === this.targetRate) return input
    const out = new Float32Array(Math.ceil(input.length / this.ratio) + 1)
    let outIdx = 0
    let pos = this.fractional
    while (pos < input.length) {
      const i = Math.floor(pos)
      const frac = pos - i
      const a = i === 0 ? this.lastSample : (input[i - 1] ?? 0)
      const b = input[i] ?? 0
      out[outIdx++] = a + (b - a) * frac
      pos += this.ratio
    }
    this.lastSample = input[input.length - 1] ?? this.lastSample
    this.fractional = pos - input.length
    return out.subarray(0, outIdx)
  }
}

/** Convert Float32 PCM (−1..1) to little-endian Int16 PCM. */
export function float32ToPcm16(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}
