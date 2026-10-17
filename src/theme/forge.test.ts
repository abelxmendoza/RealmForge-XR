import { describe, expect, it } from 'vitest'
import { FORGE } from './forge'

describe('FORGE theme', () => {
  it('exposes molten-forge tokens used by desktop and XR UIs', () => {
    expect(FORGE.ember).toMatch(/^#[0-9a-f]{6}$/i)
    expect(FORGE.panel).toMatch(/^#[0-9a-f]{6}$/i)
    expect(FORGE.text).toMatch(/^#[0-9a-f]{6}$/i)
    expect(FORGE.emberActive).toBe('#aa4d12')
  })
})
