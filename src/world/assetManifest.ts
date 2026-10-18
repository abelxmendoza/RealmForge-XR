import { getAsset, registerAssets, type CatalogAsset } from './assetLibrary'

/**
 * Custom assets from `public/assets/library.json` (served at `assets/library.json`). Format, version 1:
 *
 * ```json
 * { "version": 1, "assets": [
 *   { "id": "forklift", "name": "Forklift", "model": "models/forklift.glb", "size": [1.2, 2.2, 2.4] }
 * ] }
 * ```
 *
 * Per asset: `id` (lowercase letters, digits, dashes), `name`, `model` (a .glb/.gltf path relative to the
 * manifest, or an https URL), `size` in real metres [width, height, depth]; optional `fit` ("contain" keeps
 * proportions, "stretch" fills the size), `solid` (blocks the robot, default true), `color` (placeholder
 * colour), `description`. Bad entries are skipped with a warning; one bad entry never blocks the rest.
 */
export interface ManifestResult {
  assets: CatalogAsset[]
  warnings: string[]
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/
const COLOR_RE = /^#[0-9a-fA-F]{6}$/
const MAX_SIZE = 100

function modelUrl(model: unknown, base: string): string | null {
  if (typeof model !== 'string' || !/\.(glb|gltf)$/i.test(model)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(model) && !/^https:\/\//i.test(model)) return null // no data:, javascript:, http:
  if (model.split(/[\\/]/).includes('..')) return null
  try {
    return new URL(model, base).href
  } catch {
    return null
  }
}

/** Validate a manifest (already-parsed JSON). `base` resolves relative model paths. */
export function parseAssetManifest(input: unknown, base = 'https://localhost/assets/library.json'): ManifestResult {
  const warnings: string[] = []
  const assets: CatalogAsset[] = []
  const m = input as { version?: unknown; assets?: unknown } | null
  if (!m || typeof m !== 'object' || m.version !== 1 || !Array.isArray(m.assets)) {
    return { assets, warnings: ['Asset manifest must be { "version": 1, "assets": [...] }.'] }
  }
  const seen = new Set<string>()
  m.assets.forEach((raw, i) => {
    const a = raw as Record<string, unknown>
    const at = `assets[${i}]`
    if (!a || typeof a !== 'object') return warnings.push(`${at} is not an object.`)
    const id = a.id
    if (typeof id !== 'string' || !ID_RE.test(id)) return warnings.push(`${at}: id must be lowercase letters, digits and dashes.`)
    if (seen.has(id)) return warnings.push(`${at}: duplicate id "${id}".`)
    if (getAsset(id)?.source === 'builtin') return warnings.push(`${at}: "${id}" is a built-in asset id.`)
    const name = typeof a.name === 'string' ? a.name.trim().slice(0, 60) : ''
    if (!name) return warnings.push(`${at}: name is required.`)
    const model = modelUrl(a.model, base)
    if (!model) return warnings.push(`${at}: model must be a .glb/.gltf path (or https URL).`)
    const size = a.size
    if (!Array.isArray(size) || size.length !== 3 || !size.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_SIZE)) {
      return warnings.push(`${at}: size must be [width, height, depth] in metres (0–${MAX_SIZE}).`)
    }
    seen.add(id)
    assets.push({
      id,
      name,
      category: 'Custom',
      kind: 'crate',
      size: [size[0], size[1], size[2]],
      color: typeof a.color === 'string' && COLOR_RE.test(a.color) ? a.color : '#9aa4ad',
      solid: a.solid === undefined ? true : a.solid === true,
      description: typeof a.description === 'string' ? a.description.slice(0, 200) : 'Custom model.',
      render: { model, fit: a.fit === 'stretch' ? 'stretch' : 'contain' },
      source: 'custom',
    })
  })
  return { assets, warnings }
}

/**
 * Fetch and register the custom asset manifest. Never throws: a missing or broken manifest just means no
 * custom assets (warnings go to the console, and to the PC through the dev log).
 */
export async function loadAssetManifest(url = 'assets/library.json'): Promise<string[]> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return []
    const result = parseAssetManifest(await res.json(), new URL(url, window.location.href).href)
    for (const w of result.warnings) console.warn('[RealmForge] asset manifest:', w)
    const ids = registerAssets(result.assets)
    if (ids.length) console.log('[RealmForge] custom assets:', ids.join(', '))
    return ids
  } catch (err) {
    console.warn('[RealmForge] asset manifest could not load', err)
    return []
  }
}
