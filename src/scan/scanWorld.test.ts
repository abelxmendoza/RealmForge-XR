import { beforeEach, describe, expect, it } from 'vitest'
import { useWorld, newId } from '../world/store'
import { currentWorldFile, replaceWorld } from '../world/persistence'
import { parseWorld } from '../world/serialize'
import { checkScanFile, importScanFile, MAX_SCAN_BYTES } from './importScan'
import { patchScan, scanPosition, setScan, useScan, type ScanSettings } from './store'

const scan = (): ScanSettings => ({
  id: 'scan-test-1',
  name: 'Hall B.glb',
  bytes: 12_345_678,
  analysis: { floorY: -130, center: [300, -200], footprint: [1200, 800], wallAngle: 0.3, size: [1300, 300, 1000], triangles: 120_000 },
  scale: 0.01,
  rotationY: -0.3,
  offset: [0.5, 0, -1],
  opacity: 0.8,
  visible: true,
  cutHeight: 2.2,
})

const reparse = () => parseWorld(JSON.parse(JSON.stringify(currentWorldFile('Hall B'))), (kind) => newId(kind))

beforeEach(() => {
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  setScan(null)
})

describe('scans in world files', () => {
  it('saves the alignment with the world, not the model', () => {
    setScan(scan())
    patchScan({ opacity: 0.5 })
    const file = currentWorldFile('Hall B')
    expect(file.scan).toMatchObject({ id: 'scan-test-1', scale: 0.01, opacity: 0.5 })
    expect(JSON.stringify(file).length).toBeLessThan(5000)
    const parsed = reparse()
    expect(parsed.ok && parsed.world.scan).toEqual({ ...scan(), opacity: 0.5 })
  })

  it('restores the scan when a world loads and clears it for one without', async () => {
    await replaceWorld({ name: 'With scan', objects: [], robotStart: [0, 0], goal: null, scan: scan() }, { confirmReplace: () => true })
    expect(useScan.getState().scan?.id).toBe('scan-test-1')
    await replaceWorld({ name: 'Plain', objects: [], robotStart: [0, 0], goal: null }, { confirmReplace: () => true })
    expect(useScan.getState().scan).toBeNull()
  })

  it('drops damaged scan settings but still loads the world', () => {
    const file = { ...currentWorldFile('x'), scan: { ...scan(), scale: -1 } }
    const parsed = parseWorld(JSON.parse(JSON.stringify(file)), (kind) => newId(kind))
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.world.scan).toBeUndefined()
    expect(parsed.ok && parsed.warnings).toContain('Ignored invalid scan settings.')
  })

  it('places the floor at y = 0 plus the user nudge', () => {
    expect(scanPosition(scan())[1]).toBeCloseTo(1.3)
    expect(scanPosition({ ...scan(), offset: [0, 0.25, 0] })[1]).toBeCloseTo(1.55)
  })
})

describe('review fixes', () => {
  it('asks before replacing a world that only has a scan in it', async () => {
    setScan(scan())
    const r = await replaceWorld({ name: 'Other', objects: [], robotStart: [0, 0], goal: null }, { confirmReplace: () => false })
    expect(r.ok).toBe(false)
    expect(useScan.getState().scan?.id).toBe('scan-test-1')
  })

  it('reloads the model when a file is re-linked under the same id, not on every tweak', () => {
    setScan(scan())
    const v = useScan.getState().modelVersion
    patchScan({ opacity: 0.4 })
    expect(useScan.getState().modelVersion).toBe(v)
    setScan({ ...useScan.getState().scan!, name: 'relinked.glb' }, 'ready')
    expect(useScan.getState().modelVersion).toBe(v + 1)
  })

  it('rejects an oversized file without reading it into memory', async () => {
    let read = false
    const huge = {
      name: 'hall.glb',
      size: MAX_SCAN_BYTES + 1,
      slice: () => new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])]),
      arrayBuffer: async () => {
        read = true
        return new ArrayBuffer(0)
      },
    } as unknown as File
    const r = await importScanFile(huge)
    expect(r.ok).toBe(false)
    expect(read).toBe(false)
  })

  it('puts the status back when an import fails', async () => {
    const broken = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 9, 9, 9, 9])], 'broken.glb')
    const r = await importScanFile(broken)
    expect(r.ok).toBe(false)
    expect(useScan.getState().status).toBe('none')
  })
})

describe('scan file checks', () => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46])
  it('accepts .glb and .gltf', () => {
    expect(checkScanFile('room.glb', glb, 1000)).toBeNull()
    expect(checkScanFile('Room.GLTF', new Uint8Array([0x7b]), 1000)).toBeNull()
  })
  it('explains what to do with other formats, bad files and huge files', () => {
    expect(checkScanFile('room.usdz', glb, 1000)).toMatch(/Export the scan as \.glb/)
    expect(checkScanFile('room.glb', new Uint8Array([1, 2, 3, 4]), 1000)).toMatch(/damaged/)
    expect(checkScanFile('room.glb', glb, MAX_SCAN_BYTES + 1)).toMatch(/limit/)
    expect(checkScanFile('notes.txt', glb, 10)).toMatch(/\.glb/)
  })
})
