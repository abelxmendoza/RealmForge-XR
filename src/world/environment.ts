import { create } from 'zustand'
import type { BuildingStyle, MaterialId } from './types'
import type { WorldSnapshot } from './store'
import { useWorld } from './store'
import { forgeDistrict, marsOutpost, warehouse } from './presets'
import { replaceWorld, type ReplaceOptions, type ReplaceResult } from './persistence'
import { useEditor } from '../editor/settings'

/**
 * Multi-environment worldbuilding: appearance + defaults live here; object layouts
 * live in presets.ts. Emiliano can call `loadEnvironment(id)` from the XR menu
 * (pass `confirmReplace` for an in-headset dialog).
 */

export type EnvironmentId = 'forge-district' | 'mars-outpost' | 'warehouse'

export interface EnvironmentLighting {
  /** Desktop / VR clear color (ignored in immersive-ar passthrough). */
  background: string
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  sunColor: string
  sunIntensity: number
  rimColor: string
  rimIntensity: number
}

export interface EnvironmentAppearance {
  groundColor: string
  groundTint: string
  tableEdge: string
  tableBase: string
  gridMinor: string
  gridMajor: string
  lighting: EnvironmentLighting
}

export interface EnvironmentDefaults {
  buildingStyle: BuildingStyle
  wallMaterial: MaterialId
  platformMaterial: MaterialId
}

export interface EnvironmentConfig {
  id: EnvironmentId
  name: string
  description: string
  appearance: EnvironmentAppearance
  defaults: EnvironmentDefaults
  /** Fresh world snapshot (new ids every call). */
  buildWorld: () => WorldSnapshot
}

/** Appearance used before any environment is loaded (matches original tabletop look). */
export const DEFAULT_APPEARANCE: EnvironmentAppearance = {
  groundColor: '#a9b8a8',
  groundTint: '#c3cbc0',
  tableEdge: '#d9d4c8',
  tableBase: '#2c2f36',
  gridMinor: '#ffffff',
  gridMajor: '#e8f4ff',
  lighting: {
    background: '#1d2433',
    hemiSky: '#e3eeff',
    hemiGround: '#5a4d3c',
    hemiIntensity: 1.1,
    sunColor: '#fff4e0',
    sunIntensity: 2.2,
    rimColor: '#9cc8ff',
    rimIntensity: 0.5,
  },
}

const FORGE_APPEARANCE: EnvironmentAppearance = {
  ...DEFAULT_APPEARANCE,
  groundColor: '#9aab9c',
  lighting: {
    ...DEFAULT_APPEARANCE.lighting,
    background: '#1a2230',
  },
}

const MARS_APPEARANCE: EnvironmentAppearance = {
  groundColor: '#c47a4a',
  groundTint: '#d4925c',
  tableEdge: '#8a5a3a',
  tableBase: '#3a2418',
  gridMinor: '#ffd2a8',
  gridMajor: '#ffe0c0',
  lighting: {
    background: '#2a1810',
    hemiSky: '#f0c8a0',
    hemiGround: '#6a3a22',
    hemiIntensity: 1.15,
    sunColor: '#ffd0a0',
    sunIntensity: 2.4,
    rimColor: '#ff8a5c',
    rimIntensity: 0.45,
  },
}

const WAREHOUSE_APPEARANCE: EnvironmentAppearance = {
  groundColor: '#8a9098',
  groundTint: '#9aa2aa',
  tableEdge: '#6a7078',
  tableBase: '#22262c',
  gridMinor: '#c8d0d8',
  gridMajor: '#e0e8f0',
  lighting: {
    background: '#1a1e24',
    hemiSky: '#d8e0ea',
    hemiGround: '#4a4e56',
    hemiIntensity: 1.0,
    sunColor: '#f0f4ff',
    sunIntensity: 1.8,
    rimColor: '#a8c0e0',
    rimIntensity: 0.55,
  },
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvironmentConfig> = {
  'forge-district': {
    id: 'forge-district',
    name: 'Forge District',
    description: 'Futuristic miniature city with roads, plaza, and industrial yard.',
    appearance: FORGE_APPEARANCE,
    defaults: { buildingStyle: 'office', wallMaterial: 'brick', platformMaterial: 'asphalt' },
    buildWorld: forgeDistrict,
  },
  'mars-outpost': {
    id: 'mars-outpost',
    name: 'Mars Outpost',
    description: 'Research habitats, solar arrays, and a comm tower on red ground.',
    appearance: MARS_APPEARANCE,
    defaults: { buildingStyle: 'industrial', wallMaterial: 'metal', platformMaterial: 'concrete' },
    buildWorld: marsOutpost,
  },
  warehouse: {
    id: 'warehouse',
    name: 'Autonomous Warehouse',
    description: 'Storage racks, loading bays, and navigable aisles for the robot.',
    appearance: WAREHOUSE_APPEARANCE,
    defaults: { buildingStyle: 'industrial', wallMaterial: 'metal', platformMaterial: 'concrete' },
    buildWorld: warehouse,
  },
}

export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS) as EnvironmentId[]

export function listEnvironments(): { id: EnvironmentId; name: string; description: string }[] {
  return ENVIRONMENT_IDS.map((id) => {
    const e = ENVIRONMENTS[id]
    return { id: e.id, name: e.name, description: e.description }
  })
}

export function getEnvironment(id: string): EnvironmentConfig | undefined {
  return ENVIRONMENTS[id as EnvironmentId]
}

export function isEnvironmentId(id: string): id is EnvironmentId {
  return id in ENVIRONMENTS
}

interface EnvironmentState {
  /** Currently loaded environment, or null for the starter sandbox world. */
  activeId: EnvironmentId | null
  appearance: EnvironmentAppearance
  setActive: (id: EnvironmentId | null) => void
}

export const useEnvironment = create<EnvironmentState>((set) => ({
  activeId: null,
  appearance: DEFAULT_APPEARANCE,
  setActive: (id) =>
    set({
      activeId: id,
      appearance: id ? ENVIRONMENTS[id].appearance : DEFAULT_APPEARANCE,
    }),
}))

function applyBrushDefaults(env: EnvironmentConfig) {
  useEditor.getState().set({
    buildingStyle: env.defaults.buildingStyle,
    wallMaterial: env.defaults.wallMaterial,
    platformMaterial: env.defaults.platformMaterial,
    roof: env.defaults.buildingStyle === 'house' ? 'pitched' : 'flat',
  })
}

export type LoadEnvironmentOptions = {
  /**
   * Required when the current world has objects. Core logic never calls `window.confirm`
   * (XR has no browser dialog). Desktop UI should pass the shared `confirmReplace`;
   * Emiliano should pass an in-headset yes/no.
   */
  confirmReplace?: ReplaceOptions['confirmReplace']
}

/**
 * Load a named environment: replaces the world snapshot, updates appearance, and applies
 * brush defaults. Never silently destroys a non-empty world — pass `confirmReplace`.
 *
 * @example
 * // empty world or already confirmed
 * await loadEnvironment('mars-outpost', { confirmReplace: () => true })
 * // XR menu
 * await loadEnvironment('warehouse', { confirmReplace: showXRConfirm })
 */
export async function loadEnvironment(id: EnvironmentId | string, opts: LoadEnvironmentOptions = {}): Promise<ReplaceResult> {
  if (!isEnvironmentId(id)) return { ok: false, error: `Unknown environment: ${id}` }
  const env = ENVIRONMENTS[id]
  const snap = env.buildWorld()
  const count = Object.keys(useWorld.getState().objects).length + Object.keys(useWorld.getState().actors).length

  if (count > 0) {
    if (!opts.confirmReplace) {
      return {
        ok: false,
        error: 'Confirmation required to replace a non-empty world. Pass confirmReplace (XR dialog or desktop confirm).',
        cancelled: true,
      }
    }
    const ok = await opts.confirmReplace(
      `Load "${env.name}"?\n\nThe current world (${count} objects) will be replaced. Unsaved changes are lost.`,
    )
    if (!ok) return { ok: false, error: 'Cancelled.', cancelled: true }
  }

  // Already confirmed (or world empty) — do not let replaceWorld fall back to window.confirm.
  const result = await replaceWorld({ ...snap, name: env.name, environmentId: env.id }, { confirmReplace: () => true })
  if (!result.ok) return result
  useEnvironment.getState().setActive(env.id)
  applyBrushDefaults(env)
  return result
}
