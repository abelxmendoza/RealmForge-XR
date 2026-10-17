/** Optional metadata keeps existing object kinds and older world files compatible. */
export const ASSET_IDS = ['storage-rack', 'workstation', 'conveyor', 'cargo', 'barrier', 'loading-bay', 'pickup-zone', 'delivery-zone', 'charging-pad', 'inspection-point'] as const
export type AssetId = typeof ASSET_IDS[number]
export const DESTINATION_ROLES = ['pickup', 'delivery', 'charging', 'inspection'] as const
export type DestinationRole = typeof DESTINATION_ROLES[number]
export const isAssetId = (value: unknown): value is AssetId => typeof value === 'string' && (ASSET_IDS as readonly string[]).includes(value)
export const isDestinationRole = (value: unknown): value is DestinationRole => typeof value === 'string' && (DESTINATION_ROLES as readonly string[]).includes(value)
