/**
 * Creative asset manifest, schema v1. One manifest per library asset at
 * creative-library/assets/<id>/manifest.json; every write bumps `revision` and the previous revision
 * is kept under history/ (see tools/creative/library.ts). Paths are relative to the asset folder.
 */
import type { ImageFormat, Issue } from './imageInfo.ts'
import type { PrepOp } from './pixels.ts'

export const MANIFEST_FORMAT = 'realmforge-creative-asset'
export const SCHEMA_VERSION = 1

export interface FileRef {
  file: string
  sha256: string
  bytes: number
}

export interface Original extends FileRef {
  format: ImageFormat
  width: number
  height: number
  alphaChannel: boolean
  sourceName: string
  importedAt: string
  issues: Issue[]
}

export interface Preparation extends FileRef {
  id: string
  /** 'original' or the id of the preparation it was derived from. */
  parent: string
  ops: PrepOp[]
  width: number
  height: number
  analysis: { subjects: number; specks: number; transparentFraction: number; foregroundFraction: number }
  issues: Issue[]
  createdAt: string
}

export type GenerationStatus = 'validated' | 'approved' | 'submitted' | 'complete' | 'failed' | 'rejected'

export interface StandardRequest {
  name: string
  inputs: {
    images: [{ upload_id: string }]
    text?: string
    multi_subject_image?: boolean
    subject_name?: string
  }
  params: {
    mesh: { quality: 'standard' | 'low' | 'ultra_low' }
    texture: { resolution: 2048 | 4096 | 8192 }
    physics: { simulator: string; body: 'rigid'; collision: string; articulated: false; collision_granularity: null }
  }
}

export interface Approval {
  at: string
  expiresAt: string
  payloadHash: string
  credits: number
  phrase: string
  acknowledgements: { credits: true; licence: true; noCardOnFile: true }
}

export interface Generation {
  id: string
  createdAt: string
  endpoint: 'standard'
  preparationId: string
  imageSha256: string
  credits: number
  status: GenerationStatus
  request: StandardRequest
  payloadHash: string
  idempotencyKey: string
  dryRun: { at: string; ok: boolean; issues: Issue[]; budgetAvailable: number }
  approval: Approval | null
  submission: { at: string; uploadId: string; jobId: string; providerAssetId: string } | null
  provider: { dir: string; files: Record<string, string>; metadataFile: string } | null
  error?: string
}

export interface ConvertedModel extends FileRef {
  from: string
  generationId: string | null
  triangles: number
  extents: [number, number, number]
  textures: { name: string; mimeType: string; embedded: boolean; bytes: number }[]
  warnings: string[]
  convertedAt: string
}

export interface Licence {
  origin: 'original-artwork' | 'licensed-third-party' | 'cc-by-4.0'
  owner: string
  attribution?: string
  source?: string
  notes: string
  /** Provider terms snapshot; filled when a generation is submitted. */
  provider?: { name: string; termsUrl: string; summary: string; giftCreditOutputsPaid: 'unconfirmed' | 'yes' | 'no' }
}

export interface AssetManifest {
  format: typeof MANIFEST_FORMAT
  schemaVersion: typeof SCHEMA_VERSION
  revision: number
  id: string
  title: string
  createdAt: string
  updatedAt: string
  original: Original
  preparations: Preparation[]
  generations: Generation[]
  converted: ConvertedModel | null
  preview: FileRef | null
  licence: Licence
}

export const KAEDIM_TERMS_SUMMARY =
  'projectsim.ai/terms: 2.2 permits robotics use and forbids training image/video/3D generators on outputs; ' +
  '3.1 allows commercial use of PAID outputs; 4.2 grants Kaedim a broad licence to outputs (training, selling/licensing ' +
  'assets); 4.3 excludes only original inputs. A 3D model generated from your artwork may be used by Kaedim. Whether ' +
  'gift-credit outputs count as "paid" is unconfirmed.'

export const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/
const SHA_RE = /^[0-9a-f]{64}$/
const REL_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/

/** Structural validation; returns problems (empty = valid). Used on every read and before every write. */
export function validateManifest(m: unknown): string[] {
  const out: string[] = []
  const x = m as Partial<AssetManifest> | null
  if (!x || typeof x !== 'object') return ['manifest is not an object']
  if (x.format !== MANIFEST_FORMAT) out.push(`format must be ${MANIFEST_FORMAT}`)
  if (x.schemaVersion !== SCHEMA_VERSION) out.push(`unsupported schemaVersion ${String(x.schemaVersion)}`)
  if (!Number.isInteger(x.revision) || (x.revision as number) < 1) out.push('revision must be a positive integer')
  if (typeof x.id !== 'string' || !ID_RE.test(x.id)) out.push('id must be lowercase letters, digits and dashes')
  const ref = (r: Partial<FileRef> | null | undefined, at: string) => {
    if (!r) return out.push(`${at} missing`)
    if (typeof r.file !== 'string' || !REL_RE.test(r.file)) out.push(`${at}.file must be a relative path inside the asset`)
    if (typeof r.sha256 !== 'string' || !SHA_RE.test(r.sha256)) out.push(`${at}.sha256 invalid`)
    if (!Number.isInteger(r.bytes) || (r.bytes as number) < 0) out.push(`${at}.bytes invalid`)
  }
  ref(x.original, 'original')
  if (x.original && !x.original.file?.startsWith('original/')) out.push('original must live under original/')
  const prepIds = new Set<string>(['original'])
  for (const [i, p] of (x.preparations ?? []).entries()) {
    ref(p, `preparations[${i}]`)
    if (!prepIds.has(p.parent)) out.push(`preparations[${i}].parent ${p.parent} unknown`)
    if (prepIds.has(p.id)) out.push(`preparations[${i}].id duplicate`)
    prepIds.add(p.id)
  }
  for (const [i, g] of (x.generations ?? []).entries()) {
    if (!prepIds.has(g.preparationId)) out.push(`generations[${i}].preparationId unknown`)
    if (g.status === 'submitted' && !g.approval) out.push(`generations[${i}] submitted without approval`)
    if (g.approval && g.approval.payloadHash !== g.payloadHash) out.push(`generations[${i}] approval is for a different payload`)
  }
  if (x.converted) ref(x.converted, 'converted')
  if (x.preview) ref(x.preview, 'preview')
  if (!x.licence || !['original-artwork', 'licensed-third-party', 'cc-by-4.0'].includes(x.licence.origin)) out.push('licence.origin invalid')
  return out
}
