import { describe, expect, it } from 'vitest'
import { parseSpatialRecord, spatialKey } from './spatialSave'

describe('spatial save records', () => {
  it('parses a valid record', () => {
    const raw = JSON.stringify({ v: 1, uuid: 'abc-123', scale: 'life', savedAt: '2026-10-17T12:00:00Z' })
    expect(parseSpatialRecord(raw)).toEqual({ v: 1, uuid: 'abc-123', scale: 'life', savedAt: '2026-10-17T12:00:00Z' })
  })
  it('rejects missing, malformed or unknown-scale records', () => {
    expect(parseSpatialRecord(null)).toBeNull()
    expect(parseSpatialRecord('{not json')).toBeNull()
    expect(parseSpatialRecord(JSON.stringify({ v: 2, uuid: 'x', scale: 'life', savedAt: 'now' }))).toBeNull()
    expect(parseSpatialRecord(JSON.stringify({ v: 1, uuid: '', scale: 'life', savedAt: 'now' }))).toBeNull()
    expect(parseSpatialRecord(JSON.stringify({ v: 1, uuid: 'x', scale: 'giant', savedAt: 'now' }))).toBeNull()
  })
  it('keys records per saved world', () => {
    expect(spatialKey('w1')).toBe('realmforge.spatial.v1.w1')
  })
})
