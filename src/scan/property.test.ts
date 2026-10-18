import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentWorldFile, markClean, refreshDirty, replaceWorld, useWorldLibrary } from '../world/persistence'
import { parseWorld } from '../world/serialize'
import { newId, useWorld } from '../world/store'
import { worldContentCount } from '../world/content'
import { calibrateScan, scanControls, showAllScans, soloScan } from './actions'
import { exportPropertyBundle, importPropertyBundle } from './propertyBundle'
import { getScanBlob, putScanBlob } from './blobStore'
import { importScanFile, loadScanModel, disposeScanModel } from './importScan'
import { addMeasurePoint, installScan, patchScan, removeScan, scanPosition, selectScan, setScan, setScans, setScanStatus, startMeasuring, useScan, type ScanSettings } from './store'

/** Actual minimal GLB with one triangle; exercises the production GLTFLoader, not a mock. */
function meshFile(name = 'kitchen.glb') {
  const positions = new Float32Array([-1, 0, -1, 1, 0, -1, 0, 0, 1])
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: positions.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, -1], max: [1, 0, 1] }] })
  const text = new TextEncoder().encode(json + ' '.repeat((4 - json.length % 4) % 4))
  const data = new ArrayBuffer(12 + 8 + text.length + 8 + positions.byteLength)
  const view = new DataView(data)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, data.byteLength, true)
  view.setUint32(12, text.length, true); view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(data, 20, text.length).set(text)
  view.setUint32(20 + text.length, positions.byteLength, true); view.setUint32(24 + text.length, 0x004e4942, true)
  new Uint8Array(data, 28 + text.length).set(new Uint8Array(positions.buffer))
  return new File([data], name, { type: 'model/gltf-binary' })
}
const section = (id: string, y = 0): ScanSettings => ({ id, name: id, bytes: 1000, scale: 1, rotationY: 0, offset: [0, y, 0], opacity: 1, visible: true, cutHeight: 2.2, level: y ? 'Upstairs' : 'Ground floor', analysis: { floorY: -1, center: [2, 3], footprint: [4, 5], wallAngle: 0, size: [4, 3, 5], triangles: 2 } })

beforeEach(() => {
  setScan(null)
  useWorld.getState().loadWorld({ objects: [], robotStart: [0, 0], goal: null })
  markClean()
})

describe('property sections shared by web and XR', () => {
  it('aligns only the selected section through shared controls and preserves elevated floors', () => {
    installScan(section('scan-kitchen')); installScan(section('scan-bedroom', 3))
    selectScan('scan-kitchen')
    scanControls().find((c) => c.id === 'east')!.run()
    expect(useScan.getState().scans[0].offset).toEqual([0.5, 0, 0])
    expect(useScan.getState().scans[1].offset).toEqual([0, 3, 0])
    expect(scanPosition(useScan.getState().scans[1])[1]).toBe(4)
    soloScan(); expect(useScan.getState().scans.map((s) => s.visible)).toEqual([true, false])
    showAllScans(); expect(useScan.getState().scans.every((s) => s.visible)).toBe(true)
    expect(worldContentCount()).toBe(2)
  })
  it('keeps load status per section and selection alone does not dirty the world', () => {
    setScans([section('scan-a'), section('scan-b')]); markClean()
    setScanStatus('missing', 'relink', 'scan-b'); selectScan('scan-b'); refreshDirty()
    expect(useScan.getState().status).toBe('missing')
    expect(useWorldLibrary.getState().dirty).toBe(false)
    selectScan('scan-a'); expect(useScan.getState().status).toBe('loading')
    patchScan({ offset: [1, 0, 0] }); refreshDirty(); expect(useWorldLibrary.getState().dirty).toBe(true)
  })
  it('calibrates selected scan with mouse/XR world-local points and cancels stale picks on selection change', () => {
    setScans([section('scan-a'), section('scan-b')])
    startMeasuring(); addMeasurePoint([0, 0, 0]); addMeasurePoint([2, 0, 0])
    expect(calibrateScan(4)).toBe(true); expect(useScan.getState().scan?.scale).toBe(2)
    startMeasuring(); addMeasurePoint([0, 0, 0]); selectScan('scan-b')
    expect(useScan.getState().measurePoints).toEqual([]); expect(useScan.getState().measuring).toBe(false)
    expect(calibrateScan(Infinity)).toBe(false)
  })
  it('round-trips every section, including hidden outdoor areas, and clears all on replacement', async () => {
    setScans([section('scan-kitchen'), { ...section('scan-yard'), visible: false, level: 'Outdoors', offset: [12, -0.2, 9] }])
    const file = currentWorldFile('Grandma’s house')
    expect(file.scan).toBeUndefined()
    const result = parseWorld(JSON.stringify(file), newId)
    expect(result.ok && result.world.scans).toEqual(useScan.getState().scans)
    await replaceWorld({ name: 'Empty', objects: [], robotStart: [0, 0], goal: null }, { confirmReplace: () => true })
    expect(useScan.getState().scans).toEqual([])
  })
  it('loads a legacy single-scan world and removes one section without deleting neighbours', async () => {
    await replaceWorld({ name: 'Old', objects: [], robotStart: [0, 0], goal: null, scan: section('scan-old') })
    expect(useScan.getState().scans).toHaveLength(1)
    installScan(section('scan-new')); removeScan('scan-old')
    expect(useScan.getState().activeId).toBe('scan-new')
    expect(useScan.getState().scans).toHaveLength(1)
  })
  it('rejects duplicate IDs, excessive section counts, and excess total bytes', () => {
    const file = currentWorldFile()
    expect(parseWorld({ ...file, scans: [section('scan-a'), section('scan-a')] }, newId).ok).toBe(false)
    expect(parseWorld({ ...file, scans: Array.from({ length: 25 }, (_, i) => section(`scan-${i}`)) }, newId).ok).toBe(false)
    expect(parseWorld({ ...file, scans: [{ ...section('scan-a'), bytes: 251 * 1048576 }] }, newId).ok).toBe(false)
  })
})

describe('GLB import and portable property transfer', () => {
  it('imports real GLBs additively, renders their geometry, bundles bytes, and restores independent copies', async () => {
    expect((await importScanFile(meshFile())).ok).toBe(true)
    const first = useScan.getState().activeId!
    patchScan({ offset: [2, 0, 3], name: 'Kitchen' })
    expect((await importScanFile(meshFile('yard.glb'))).ok).toBe(true)
    const second = useScan.getState().activeId!
    patchScan({ level: 'Outdoors', offset: [8, -0.2, 4], visible: false })
    const model = await loadScanModel(first)
    expect(model?.children.length).toBeGreaterThan(0); if (model) disposeScanModel(model)
    const bundle = await exportPropertyBundle()
    const result = await importPropertyBundle(bundle, { confirmReplace: () => true })
    expect(result.ok).toBe(true)
    const scans = useScan.getState().scans
    expect(scans.map((s) => s.name)).toEqual(['Kitchen', 'yard.glb'])
    expect(scans.map((s) => s.offset)).toEqual([[2, 0, 3], [8, -0.2, 4]])
    expect(scans[1].visible).toBe(false)
    expect(scans.map((s) => s.id)).not.toContain(first); expect(scans.map((s) => s.id)).not.toContain(second)
    expect((await getScanBlob(scans[0].id))?.size).toBe(meshFile().size)
    expect((await getScanBlob(first))?.size).toBe(meshFile().size)
  })
  it('does not replace the world on cancelled or damaged bundle import', async () => {
    await importScanFile(meshFile())
    const before = currentWorldFile()
    const bundle = await exportPropertyBundle()
    expect((await importPropertyBundle(bundle, { confirmReplace: () => false })).ok).toBe(false)
    expect(currentWorldFile().scans).toEqual(before.scans)
    expect((await importPropertyBundle(bundle.slice(0, bundle.size - 1))).ok).toBe(false)
    expect((await importPropertyBundle(new Blob(['garbage']))).ok).toBe(false)
    expect(currentWorldFile().scans).toEqual(before.scans)
  })
  it('refuses a bundle when any scan is missing locally', async () => {
    installScan(section('scan-missing'))
    await expect(exportPropertyBundle()).rejects.toThrow(/Re-link/)
  })
  it('preserves other sections and alignment when a missing file is re-linked', async () => {
    await importScanFile(meshFile()); const first = useScan.getState().activeId!
    patchScan({ offset: [5, 3, -2], scale: 2, level: 'Upstairs' })
    await importScanFile(meshFile('yard.glb'))
    const r = await importScanFile(meshFile('kitchen-again.glb'), { relink: true, targetId: first })
    expect(r.ok).toBe(true); expect(useScan.getState().scans).toHaveLength(2)
    expect(useScan.getState().scan).toMatchObject({ id: first, offset: [5, 3, -2], scale: 2, level: 'Upstairs' })
  })
  it('does not install an import into a different world after a delayed read', async () => {
    const source = meshFile()
    let release!: (data: ArrayBuffer) => void
    const delayed = { name: source.name, size: source.size, slice: source.slice.bind(source), arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { release = resolve }) } as File
    const pending = importScanFile(delayed)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    setScans([]); release(await source.arrayBuffer())
    expect((await pending).ok).toBe(false); expect(useScan.getState().scans).toEqual([])
  })
})
