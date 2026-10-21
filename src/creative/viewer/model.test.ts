import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { frameModel, parseGlb, setWireframe } from './model'
import { quadGltf } from '../testing/fixtures'

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

describe('viewer loading', () => {
  it('parses a GLB with the viewer loader and frames it', async () => {
    const scene = await parseGlb(ab(quadGltf({ w: 2, h: 1, translation: [5, 0, 0] }).glb))
    const f = frameModel(scene)
    expect(f.size.x).toBeCloseTo(2)
    expect(f.size.y).toBeCloseTo(1)
    expect(f.center.x).toBeCloseTo(6)
    expect(f.triangles).toBe(2)
    expect(f.camera.distanceTo(f.center)).toBeGreaterThan(f.radius)
  })

  it('rejects broken files instead of rendering garbage', async () => {
    await expect(parseGlb(ab(new TextEncoder().encode('not a model')))).rejects.toThrow()
  })

  it('refuses to frame an empty scene and toggles wireframe on every material', async () => {
    expect(() => frameModel(new THREE.Group())).toThrow(/no geometry/)
    const scene = await parseGlb(ab(quadGltf().glb))
    setWireframe(scene, true)
    const mats: THREE.MeshStandardMaterial[] = []
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) mats.push((o as THREE.Mesh).material as THREE.MeshStandardMaterial) })
    expect(mats.length).toBe(1)
    expect(mats.every((m) => m.wireframe)).toBe(true)
  })

  // The committed gallery assets (built by tools/creative/build_gallery_samples.py) load and have
  // the real-world size their sample manifest states. Textures are not decoded in Node (no DOM).
  const gallery = path.resolve(__dirname, '../../../public/creative/gallery')
  it.skipIf(!existsSync(path.join(gallery, 'gallery.json')))('gallery GLBs pass the conversion gate and match recorded extents', async () => {
    const { inspectGltf } = await import('../glb')
    const doc = JSON.parse(readFileSync(path.join(gallery, 'gallery.json'), 'utf8'))
    expect(doc.assets.length).toBeGreaterThan(0)
    for (const a of doc.assets) {
      const bytes = new Uint8Array(readFileSync(path.join(gallery, a.file)))
      const r = inspectGltf(bytes)
      expect(r.errors).toEqual([])
      expect(r.triangles).toBe(a.triangles)
      r.extents.forEach((e, i) => expect(e).toBeCloseTo(a.extents_m[i], 2))
      expect(r.textures.length).toBeGreaterThan(0)
      expect(a.licence).toMatchObject({ id: 'CC-BY-4.0', attribution: 'projectsim by Kaedim' })
    }
  })
})
