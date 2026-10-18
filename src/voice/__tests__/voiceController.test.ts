import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorld } from '../../world/store'
import { clearHistory, installHistory, withHistorySuppressed } from '../../world/history'
import { submitMockTranscript, isMockProviderReady } from '../mockProvider'
import { VoiceController } from '../voiceController'

let controller: VoiceController

beforeEach(() => {
  installHistory()
  withHistorySuppressed(() => {
    useWorld.getState().loadWorld({
      objects: [],
      robotStart: [0, 5],
      goal: null,
    })
  })
  clearHistory()
  controller = new VoiceController({ provider: 'mock' })
})

afterEach(async () => {
  await controller.dispose()
})

describe('VoiceController + mock provider', () => {
  it('registers mock handler when constructed', () => {
    expect(isMockProviderReady()).toBe(true)
  })

  it('executes finalized mock transcripts through parser', async () => {
    await controller.startListening()
    const delivered = submitMockTranscript('Select wall tool')
    expect(delivered).toBe(true)
    // allow async handleTranscript
    await vi.waitFor(() => {
      expect(controller.getState().lastCommand).toEqual({ type: 'SELECT_TOOL', tool: 'wall' })
    })
    expect(useWorld.getState().tool).toBe('wall')
  })

  it('ignores partial transcripts', async () => {
    await controller.handleTranscript({ text: 'Load Mar', isFinal: false })
    expect(controller.getState().lastCommand).toBeNull()
    expect(controller.getState().lastPartial).toBe('Load Mar')
    expect(useWorld.getState().tool).not.toBe('building')
  })

  it('deduplicates identical final transcripts', async () => {
    const a = await controller.submitTranscript('Select building tool')
    const b = await controller.submitTranscript('Select building tool')
    expect(a?.status).toBe('executed')
    expect(b).toBeNull()
  })

  it('rejects unsupported finals without executing', async () => {
    const r = await controller.submitTranscript('teleport to the moon')
    expect(r?.status).toBe('rejected')
    expect(controller.getState().lastError).toBeNull()
  })

  it('can disable recognition', async () => {
    controller.setEnabled(false)
    const r = await controller.submitTranscript('Undo')
    expect(r).toBeNull()
  })

  it('stopListening clears listening flag', async () => {
    await controller.startListening()
    expect(controller.getState().isListening).toBe(true)
    await controller.stopListening()
    expect(controller.getState().isListening).toBe(false)
  })

  it('dispose unregisters mock handler', async () => {
    await controller.dispose()
    expect(isMockProviderReady()).toBe(false)
    // recreate for afterEach
    controller = new VoiceController({ provider: 'mock' })
  })
})

describe('VoiceController destructive confirms', () => {
  it('does not delete without confirm', async () => {
    useWorld.getState().loadWorld({
      objects: [
        {
          id: 'bld-9',
          kind: 'building',
          position: [0, 0, 0],
          size: [2, 2, 2],
          rotationY: 0,
          color: '#fff',
        },
      ],
      robotStart: [0, 0],
      goal: null,
    })
    useWorld.getState().select('bld-9')
    const r = await controller.submitTranscript('Delete selected object')
    expect(r?.status).toBe('needs_confirmation')
    expect(useWorld.getState().objects['bld-9']).toBeTruthy()
  })
})

describe('connection / mic failure surfaces', () => {
  it('falls back to mock when AssemblyAI fails and browser speech is unavailable', async () => {
    const c = new VoiceController({
      provider: 'assemblyai',
      fallbackToMock: true,
      fallbackToWebSpeech: true,
      tokenUrl: '/api/assemblyai/token-missing',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down')) as typeof fetch

    await c.startListening()
    expect(c.getState().provider).toBe('mock')
    expect(c.getState().isListening).toBe(true)
    expect(c.getState().lastError).toMatch(/network down|type a command|mic/i)

    globalThis.fetch = originalFetch
    await c.dispose()
  })

  it('falls back to browser speech when AssemblyAI fails on a supporting browser', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    class FakeRecognition {
      continuous = false
      interimResults = false
      lang = ''
      onresult = null
      onerror = null
      onend = null
      start = start
      stop = stop
      abort = vi.fn()
    }
    const g = globalThis as { SpeechRecognition?: unknown }
    const previous = g.SpeechRecognition
    g.SpeechRecognition = FakeRecognition

    const c = new VoiceController({
      provider: 'assemblyai',
      fallbackToMock: false,
      fallbackToWebSpeech: true,
      tokenUrl: '/api/assemblyai/token-missing',
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'bad key' }),
    }) as typeof fetch

    await c.startListening()
    expect(start).toHaveBeenCalled()
    expect(c.getState().provider).toBe('webspeech')
    expect(c.getState().isListening).toBe(true)

    globalThis.fetch = originalFetch
    g.SpeechRecognition = previous
    await c.dispose()
  })
})
