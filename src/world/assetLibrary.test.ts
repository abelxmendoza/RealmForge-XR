import { describe, expect, it } from 'vitest'
import { ASSETS, assetsIn, getAsset, libraryAssets, registerAssets, type CatalogAsset } from './assetLibrary'
import { buildAsset } from './assets'
import { isAssetId } from './assetTypes'
import { parseAssetManifest } from './assetManifest'
import { PALLET, RACK } from './scale'
import { parseWorld, serializeWorld } from './serialize'
import { idFor } from './store'

describe('asset library', () => {
  it('holds main’s catalog plus pallets, racks, buildings and decor, with unique ids', () => {
    const all = libraryAssets()
    for (const a of ASSETS) expect(getAsset(a.id)).toBeDefined()
    expect(assetsIn('Warehouse').map((a) => a.kind)).toEqual(expect.arrayContaining(['pallet', 'rack']))
    expect(assetsIn('Structures').length).toBeGreaterThanOrEqual(4)
    expect(assetsIn('Decor').length).toBeGreaterThanOrEqual(3)
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length)
  })

  it('builds pallets and racks at real size with their style', () => {
    const p = buildAsset('pallet-boxes', [0, 0], 0, false)!
    expect(p).toMatchObject({ kind: 'pallet', style: 'boxes', assetId: 'pallet-boxes' })
    expect(p.size).toEqual([PALLET.width, PALLET.heightFor.boxes, PALLET.depth])
    const r = buildAsset('rack-3-loaded', [0, 0], 0, false)!
    expect(r.kind).toBe('rack')
    expect(r.size[0]).toBeCloseTo(3 * RACK.bay)
  })

  it('registers custom assets, but never replaces a built-in', () => {
    const custom: CatalogAsset = {
      id: 'test-forklift', name: 'Forklift', category: 'Custom', kind: 'crate', size: [1.2, 2.2, 2.4], color: '#ffaa00',
      solid: true, description: '', render: { model: 'https://x.test/forklift.glb', fit: 'contain' }, source: 'custom',
    }
    expect(isAssetId('test-forklift')).toBe(false)
    expect(registerAssets([custom, { ...custom, id: 'cargo' }])).toEqual(['test-forklift'])
    expect(isAssetId('test-forklift')).toBe(true)
    expect(getAsset('cargo')!.source).toBe('builtin')
  })

  it('a placed custom asset survives save → load while it is registered', () => {
    const o = { ...buildAsset('test-forklift', [2, 3], 0, false)!, id: 'crate-9' }
    const r = parseWorld(JSON.parse(JSON.stringify(serializeWorld({ objects: [o], robotStart: [0, 0], goal: null }, 'w'))), idFor)
    expect(r.ok && r.world.objects[0].assetId).toBe('test-forklift')
  })
})

describe('asset manifest', () => {
  const base = 'https://quest.test/assets/library.json'
  const good = { id: 'pump-skid', name: 'Pump skid', model: 'models/pump.glb', size: [2, 1.5, 1] }

  it('accepts a valid entry and resolves the model next to the manifest', () => {
    const r = parseAssetManifest({ version: 1, assets: [good] }, base)
    expect(r.warnings).toEqual([])
    expect(r.assets[0]).toMatchObject({ id: 'pump-skid', category: 'Custom', solid: true, render: { model: 'https://quest.test/assets/models/pump.glb', fit: 'contain' } })
  })

  it('skips bad entries with a warning and keeps the good ones', () => {
    const r = parseAssetManifest(
      {
        version: 1,
        assets: [
          good,
          { ...good }, // duplicate id
          { ...good, id: 'Bad Id' },
          { ...good, id: 'cargo' }, // built-in
          { ...good, id: 'no-size', size: [1, 0, 1] },
          { ...good, id: 'evil', model: 'javascript:alert(1).glb' },
          { ...good, id: 'escape', model: '../../secret.glb' },
          { ...good, id: 'not-a-model', model: 'models/readme.txt' },
        ],
      },
      base,
    )
    expect(r.assets.map((a) => a.id)).toEqual(['pump-skid'])
    expect(r.warnings).toHaveLength(7)
  })

  it('rejects a manifest with the wrong shape', () => {
    expect(parseAssetManifest({ assets: [] }).warnings).toHaveLength(1)
    expect(parseAssetManifest(null).assets).toEqual([])
  })
})
