import { describe, expect, it } from 'vitest'
import { checkScanFile } from './importScan'

const header = (s: string) => new TextEncoder().encode(s)

describe('Scaniverse-compatible scan formats', () => {
  it('accepts a nonempty OBJ mesh', () => {
    expect(checkScanFile('living-room.obj', header('v 0 0 0\n'), 8)).toBeNull()
  })
  it('accepts a GLB header', () => {
    expect(checkScanFile('living-room.glb', header('glTF'), 1024)).toBeNull()
  })
  it('rejects empty OBJ files', () => {
    expect(checkScanFile('empty.obj', new Uint8Array(), 0)).toMatch(/empty/i)
  })
  it('rejects unsupported USDZ', () => {
    expect(checkScanFile('room.usdz', new Uint8Array(), 1024)).toMatch(/not supported/i)
  })
  it('rejects oversized OBJ files', () => {
    expect(checkScanFile('room.obj', header('v 0 0 0'), 251 * 1024 * 1024)).toMatch(/limit/i)
  })
})
