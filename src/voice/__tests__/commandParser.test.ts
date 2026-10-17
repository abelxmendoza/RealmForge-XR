import { describe, expect, it } from 'vitest'
import { normalizeTranscript, parseVoiceCommand } from '../commandParser'

describe('normalizeTranscript', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTranscript('  Load Mars!  ')).toBe('load mars')
  })
})

describe('parseVoiceCommand — environments', () => {
  it('recognizes Mars variants', () => {
    expect(parseVoiceCommand('Load Mars')).toEqual({
      ok: true,
      command: { type: 'LOAD_ENVIRONMENT', environmentId: 'mars-outpost' },
    })
    expect(parseVoiceCommand('Open Mars Outpost')).toEqual({
      ok: true,
      command: { type: 'LOAD_ENVIRONMENT', environmentId: 'mars-outpost' },
    })
  })

  it('recognizes warehouse and forge district', () => {
    expect(parseVoiceCommand('Switch to warehouse').ok && parseVoiceCommand('Switch to warehouse')).toMatchObject({
      ok: true,
      command: { type: 'LOAD_ENVIRONMENT', environmentId: 'warehouse' },
    })
    expect(parseVoiceCommand('Load Forge District')).toMatchObject({
      ok: true,
      command: { type: 'LOAD_ENVIRONMENT', environmentId: 'forge-district' },
    })
  })

  it('maps blank world to RESET_WORLD', () => {
    expect(parseVoiceCommand('Create a blank world')).toEqual({
      ok: true,
      command: { type: 'RESET_WORLD' },
    })
  })
})

describe('parseVoiceCommand — tools', () => {
  it('selects building tool for create/select phrases', () => {
    expect(parseVoiceCommand('Select building tool')).toEqual({
      ok: true,
      command: { type: 'SELECT_TOOL', tool: 'building' },
    })
    expect(parseVoiceCommand('Building tool')).toEqual({
      ok: true,
      command: { type: 'SELECT_TOOL', tool: 'building' },
    })
  })

  it('selects wall, platform, robot, goal tools', () => {
    expect(parseVoiceCommand('Select wall tool')).toMatchObject({
      command: { type: 'SELECT_TOOL', tool: 'wall' },
    })
    expect(parseVoiceCommand('Platform tool')).toMatchObject({
      command: { type: 'SELECT_TOOL', tool: 'platform' },
    })
    expect(parseVoiceCommand('Select robot')).toMatchObject({
      command: { type: 'SELECT_TOOL', tool: 'robot' },
    })
    expect(parseVoiceCommand('Set destination')).toMatchObject({
      command: { type: 'SELECT_TOOL', tool: 'goal' },
    })
  })
})

describe('parseVoiceCommand — editor', () => {
  it('parses undo / redo / save', () => {
    expect(parseVoiceCommand('Undo')).toEqual({ ok: true, command: { type: 'UNDO' } })
    expect(parseVoiceCommand('Redo')).toEqual({ ok: true, command: { type: 'REDO' } })
    expect(parseVoiceCommand('Save world')).toEqual({ ok: true, command: { type: 'SAVE_WORLD' } })
  })

  it('parses delete / clear selection / start navigation', () => {
    expect(parseVoiceCommand('Delete selected object')).toEqual({
      ok: true,
      command: { type: 'DELETE_SELECTED' },
    })
    expect(parseVoiceCommand('Reset selection')).toEqual({
      ok: true,
      command: { type: 'CLEAR_SELECTION' },
    })
    expect(parseVoiceCommand('Start navigation')).toEqual({
      ok: true,
      command: { type: 'START_NAVIGATION' },
    })
  })

  it('returns unsupported for unknown and stop navigation', () => {
    expect(parseVoiceCommand('make me a sandwich')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    })
    expect(parseVoiceCommand('Stop navigation')).toMatchObject({
      ok: false,
      reason: 'unsupported',
    })
  })

  it('returns empty for blank input', () => {
    expect(parseVoiceCommand('   ')).toMatchObject({ ok: false, reason: 'empty' })
  })
})
