import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorld } from '../../world/store'
import { clearHistory, installHistory, withHistorySuppressed } from '../../world/history'
import { VoiceController } from '../voiceController'
import { resetClaudeFallback } from '../claudeFallback'
import { planVoiceCommands } from '../../../tools/voice-plan'

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
let controller: VoiceController

beforeEach(() => {
  installHistory()
  withHistorySuppressed(() => useWorld.getState().loadWorld({ objects: [], actors: [], robotStart: [-30, 30], goal: [30, -30] }))
  clearHistory()
  resetClaudeFallback()
  controller = new VoiceController({ provider: 'mock', claudeFallback: true })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await controller.dispose()
})

describe('Claude fallback', () => {
  it('runs the commands Claude rewrote the sentence into, through our own parser', async () => {
    const fetch = reply(200, { commands: ['add a road', 'add 4 houses along the road', 'launch the missiles', 'add a few people walking around'], note: 'Shops are houses for now.' })
    vi.stubGlobal('fetch', fetch)
    const r = await controller.submitTranscript('a cosy village with a few shops facing the high road and folks strolling')
    expect(fetch).toHaveBeenCalledOnce()
    expect(r?.status).toBe('executed')
    expect(r && 'message' in r && r.message).toMatch(/^Added a road, 4 houses and 3 people walking around\. Shops are houses for now\.$/)
    expect(Object.values(useWorld.getState().objects).filter((o) => o.kind === 'building')).toHaveLength(4)
  })

  it('never calls Claude for sentences the keywords understand', async () => {
    const fetch = reply(200, { commands: [], note: '' })
    vi.stubGlobal('fetch', fetch)
    await controller.submitTranscript('add two houses and a road')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the keyword result, and stops asking, when the server has no key', async () => {
    const fetch = reply(503, { error: 'ANTHROPIC_API_KEY is not configured on the server.' })
    vi.stubGlobal('fetch', fetch)
    expect((await controller.submitTranscript('conjure a moat'))?.status).toBe('rejected')
    await controller.submitTranscript('summon a dragon')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('server says 503 without a key and never calls out', async () => {
    expect(await planVoiceCommands({ transcript: 'a village' }, {})).toMatchObject({ ok: false, status: 503 })
  })
})
