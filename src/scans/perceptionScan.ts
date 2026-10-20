import { WORLD, type WorldObject } from '../world/types'
import { LIMITS, type WorldFile } from '../world/serialize'

/** Package map adapter only. Visual meshes/splats are a separate future layer. */
export interface ScanFile { name: string; size: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }
const MAX_BYTES = 10 * 1024 * 1024
const transform = [[0,-1,0,0],[0,0,1,0],[-1,0,0,0],[0,0,0,1]]
const fail = (message: string): never => { throw new Error(message) }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a JSON object.')
  return value as Record<string, unknown>
}
function localName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value) || value === '.' || value === '..') fail('This importer requires package files in one folder, with local filenames.')
  return value as string
}

export function parsePgm(data: Uint8Array) {
  let pos = 0
  const whitespace = (n: number) => [9,10,13,32].includes(n)
  const tokens: string[] = []
  while (tokens.length < 4) {
    while (pos < data.length && whitespace(data[pos])) pos++
    if (data[pos] === 35) { while (pos < data.length && data[pos] !== 10) pos++; continue }
    const start = pos
    while (pos < data.length && !whitespace(data[pos]) && data[pos] !== 35) pos++
    if (pos === start) fail('Invalid PGM header.')
    tokens.push(new TextDecoder().decode(data.slice(start,pos)))
  }
  const width = Number(tokens[1]), height = Number(tokens[2])
  if (tokens[0] !== 'P5' || tokens[3] !== '255' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 1_000_000) fail('Expected an 8-bit P5 map, at most one million cells.')
  if (!whitespace(data[pos])) fail('Missing PGM header separator.')
  pos += data[pos] === 13 && data[pos+1] === 10 ? 2 : 1
  const pixels = data.slice(pos)
  if (pixels.length !== width * height || pixels.some(p => ![0,205,254].includes(p))) fail('Invalid map pixels; expected occupied=0, unknown=205, free=254.')
  return { width, height, pixels }
}

export async function readPerceptionScan(files: readonly ScanFile[]): Promise<{ world: WorldFile; warnings: string[] }> {
  if (!files.length || files.length > 10 || files.reduce((sum,f) => sum+f.size,0) > MAX_BYTES) fail('Select manifest.json, map.yaml and map.pgm (up to 10 MB total).')
  const selected = new Map<string, ScanFile>()
  for (const file of files) {
    const name = localName(file.name)
    if (selected.has(name)) fail(`Duplicate filename: ${name}`)
    selected.set(name,file)
  }
  const get = (name: unknown) => selected.get(localName(name)) ?? fail(`Missing selected file: ${String(name)}`)
  const m = object(JSON.parse(await get('manifest.json').text()))
  if (m.package_type !== 'perception_scan' || m.schema_version !== 1 || m.units !== 'metres' || m.frame !== 'map') fail('Unsupported scan package version, units, or frame.')
  if (!['synthetic','hardware','dataset'].includes(String(m.source))) fail('Unknown scan provenance.')
  const axes = object(m.axes)
  if (axes.x !== 'forward' || axes.y !== 'left' || axes.z !== 'up' || JSON.stringify(m.T_realmforge_map) !== JSON.stringify(transform)) fail('Unsupported scan coordinate transform.')
  const assets = object(m.files)
  const yaml = await get(assets.occupancy).text()
  const field = (name: string) => {
    const values = [...yaml.matchAll(new RegExp(`^${name}\\s*:\\s*(.*?)\\s*$`,'gm'))]
    if (values.length !== 1) fail(`Map requires exactly one ${name}.`)
    return values[0][1]
  }
  const resolution = Number(field('resolution'))
  const origin: unknown = JSON.parse(field('origin'))
  if (!Number.isFinite(resolution) || resolution < LIMITS.minSize || !Array.isArray(origin) || origin.length !== 3 || !origin.every(v => typeof v === 'number' && Number.isFinite(v)) || origin[2] !== 0) fail('Invalid map resolution/origin; rotated origins are unsupported.')
  const xy = origin as number[]
  if (field('negate') !== '0' || Number(field('occupied_thresh')) !== .65 || Number(field('free_thresh')) !== .196) fail('Unsupported occupancy thresholds.')
  const pgm = parsePgm(new Uint8Array(await get(field('image').replace(/^["']|["']$/g,'')).arrayBuffer()))
  if (Math.max(Math.abs(xy[0]),Math.abs(xy[1]),Math.abs(xy[0]+pgm.width*resolution),Math.abs(xy[1]+pgm.height*resolution)) > WORLD.half) fail('Scan extends outside this editor’s map bounds; crop it before importing.')
  if (m.occupancy !== undefined) {
    const occupancy = object(m.occupancy)
    if (occupancy.resolution_m !== resolution || JSON.stringify(occupancy.origin_xy) !== JSON.stringify(xy.slice(0,2)) || occupancy.unknown_preserved !== true) fail('Manifest and map geometry disagree.')
  }
  const objects: WorldObject[] = []
  for (let row=0;row<pgm.height;row++) {
    let x=0
    while (x<pgm.width) {
      const value = pgm.pixels[row*pgm.width+x]
      if (value === 254) { x++; continue }
      let end=x+1
      while (end<pgm.width && pgm.pixels[row*pgm.width+end] === value) end++
      const mapX=xy[0]+(x+end)*resolution/2
      const mapY=xy[1]+(pgm.height-row-.5)*resolution
      objects.push({id:`scan-${row}-${x}`,kind:'wall',position:[-mapY,0,-mapX],size:[resolution,1.5,(end-x)*resolution],rotationY:0,solid:true,color:value===205?'#555555':'#b87832'})
      if (objects.length > LIMITS.maxObjects) fail('Too many collision blocks; use a coarser occupancy map.')
      x=end
    }
  }
  return {
    world:{format:'realmforge-world',version:1,name:`${m.source} scan map`,savedAt:new Date().toISOString(),environmentId:'empty-event-venue',objects,robotEnabled:false,robotStart:[0,0],goal:null},
    warnings:[`Source: ${m.source}. Imported 2D collision proxies only; mesh and textures are not loaded.`, 'Unknown cells remain blocked. Place the robot in observed free space; this height-band map is not drone clearance.'],
  }
}
