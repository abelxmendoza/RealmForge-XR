import { describe, expect, it } from 'vitest'
import { mintAssemblyAiToken, readAssemblyAiApiKey } from './assemblyai-token'

describe('assemblyai-token', () => {
  it('reads either ASSEMBLYAI_API_KEY or ASSEMBLY_AI_API_KEY', () => {
    expect(readAssemblyAiApiKey({ ASSEMBLYAI_API_KEY: 'a' })).toBe('a')
    expect(readAssemblyAiApiKey({ ASSEMBLY_AI_API_KEY: 'b' })).toBe('b')
    expect(readAssemblyAiApiKey({})).toBeUndefined()
  })

  it('returns 503 when no API key is configured', async () => {
    const result = await mintAssemblyAiToken({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(503)
    expect(result.body.error).toMatch(/ASSEMBLYAI_API_KEY/)
  })
})
