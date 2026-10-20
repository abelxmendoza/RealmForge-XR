import { describe, it, expect } from 'vitest'
import { readPerceptionScan, parsePgm, type ScanFile } from './perceptionScan'
import { parseWorld } from '../world/serialize'
import { idFor } from '../world/store'

function file(name: string, content: string | Uint8Array): ScanFile {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  return {name,size:bytes.length,text:async()=>new TextDecoder().decode(bytes),arrayBuffer:async()=>Uint8Array.from(bytes).buffer}
}
function fixture(patch: Record<string,unknown> = {}) {
  const manifest = {package_type:'perception_scan',schema_version:1,source:'synthetic',units:'metres',frame:'map',axes:{x:'forward',y:'left',z:'up'},T_realmforge_map:[[0,-1,0,0],[0,0,1,0],[-1,0,0,0],[0,0,0,1]],files:{point_cloud:'cloud.ply',occupancy:'map.yaml'},...patch}
  const header=new TextEncoder().encode('P5\n3 2\n255\n')
  const data=new Uint8Array([...header,0,254,205,254,254,254])
  return [file('manifest.json',JSON.stringify(manifest)),file('map.yaml','image: map.pgm\nresolution: 0.5\norigin: [1, 2, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n'),file('map.pgm',data)]
}
describe('perception scan map import',()=>{
  it('uses metric transforms, flips PGM rows and preserves unknown blockers',async()=>{
    const result=await readPerceptionScan(fixture())
    expect(result.world.objects).toHaveLength(2)
    expect(result.world.objects[0].position).toEqual([-2.75,0,-1.25])
    expect(result.world.objects[1].solid).toBe(true)
    expect(result.world.robotEnabled).toBe(false)
    expect(result.warnings.join(' ')).toContain('synthetic')
    expect(parseWorld(result.world,idFor).ok).toBe(true)
  })
  it.each([{schema_version:2},{units:'feet'},{frame:'optical'},{T_realmforge_map:[]},{source:'unverified'}])('rejects incompatible manifest %j',async patch=>{
    await expect(readPerceptionScan(fixture(patch))).rejects.toThrow()
  })
  it('rejects missing assets and unsafe filenames',async()=>{
    await expect(readPerceptionScan(fixture().slice(0,2))).rejects.toThrow('Missing selected file')
    await expect(readPerceptionScan(fixture({files:{occupancy:'../map.yaml'}}))).rejects.toThrow('local filenames')
    await expect(readPerceptionScan([...fixture(),fixture()[0]])).rejects.toThrow('Duplicate')
  })
  it('rejects bounds or metadata disagreement rather than clamping',async()=>{
    const files=fixture()
    files[1]=file('map.yaml',(await files[1].text()).replace('[1, 2, 0]','[100, 100, 0]'))
    await expect(readPerceptionScan(files)).rejects.toThrow('bounds')
    await expect(readPerceptionScan(fixture({occupancy:{resolution_m:1,origin_xy:[1,2],unknown_preserved:true}}))).rejects.toThrow('disagree')
  })
  it('never consumes the first pixel as trailing header whitespace',()=>{
    const bytes=new Uint8Array([...new TextEncoder().encode('P5\n1 1\n255\n'),10])
    // 10 is invalid occupancy, so it must be validated as a pixel, not discarded.
    expect(()=>parsePgm(bytes)).toThrow('Invalid map pixels')
  })
})

it('imports a real synthetic producer package through the native world parser',async()=>{
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const files=['manifest.json','map.yaml','map.pgm'].map(name=>file(name,readFileSync(resolve('tests/fixtures/perception-scan',name))))
  const result=await readPerceptionScan(files)
  expect(result.world.objects.length).toBeGreaterThan(0)
  expect(parseWorld(result.world,idFor).ok).toBe(true)
})

it('honors replacement cancellation without mutating the active world',async()=>{
  const { menuImportScan, resetWorldsMenuController } = await import('../editor/worldsMenuController')
  const { useWorld } = await import('../world/store')
  resetWorldsMenuController()
  useWorld.getState().reset()
  const before=JSON.stringify(useWorld.getState().objects)
  const result=await menuImportScan(fixture(),()=>false)
  expect(result.feedback.kind).toBe('cancelled')
  expect(JSON.stringify(useWorld.getState().objects)).toBe(before)
})
