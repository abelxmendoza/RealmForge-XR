import { getAsset } from './assetLibrary'
/** Optional metadata keeps existing object kinds and older world files compatible. */
export const ASSET_IDS = ['storage-rack', 'workstation', 'conveyor', 'cargo', 'barrier', 'loading-bay', 'pickup-zone', 'delivery-zone', 'charging-pad', 'inspection-point'] as const
/** main's warehouse catalog ids. */
export type CatalogAssetId = typeof ASSET_IDS[number]
/** Any asset in the library (built-in or custom; see assetLibrary.ts). */
export type AssetId = string
export const DESTINATION_ROLES = ['pickup', 'delivery', 'charging', 'inspection'] as const
export type DestinationRole = typeof DESTINATION_ROLES[number]
/** A registered library asset (unknown ids are dropped on import). */
export const isAssetId = (value: unknown): value is AssetId => typeof value === 'string' && !!getAsset(value)
export const isDestinationRole = (value: unknown): value is DestinationRole => typeof value === 'string' && (DESTINATION_ROLES as readonly string[]).includes(value)
