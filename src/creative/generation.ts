/**
 * Generation preview, dry-run validation and the approval gate. Pure; hashing is injected so the
 * browser never needs crypto and tests use node:crypto.
 *
 * Lifecycle (no step is ever automatic):
 *   dry-run   build the exact request, validate it against the documented Standard contract, price it,
 *             check the budget. No network. Status "validated".
 *   approve   a human types `SPEND <n> CREDITS` and ticks three acknowledgements (credits, Kaedim
 *             licence terms, no card on file). The approval is bound to the payload hash and expires.
 *   submit    server-side only, and only when CREATIVE_ALLOW_SPEND=1 is set in the dev server's own
 *             environment (tools/creative/service.ts). Re-validates everything here first.
 */
import { CREDITS } from './credits.ts'
import { MIME, PROVIDER_MAX_BYTES, type Issue } from './imageInfo.ts'
import type { Approval, Generation, Preparation, StandardRequest } from './manifest.ts'

export const UPLOAD_PLACEHOLDER = '<minted-at-submit>'
export const APPROVAL_TTL_MS = 30 * 60 * 1000

export interface GenerationOptions {
  name: string
  text?: string
  subjectName?: string
  meshQuality?: 'standard' | 'low' | 'ultra_low'
  textureResolution?: 2048 | 4096 | 8192
  simulator?: 'agnostic'
}

/** Defaults: agnostic simulator = FBX + GLB + physics sidecar, which the web viewer consumes. */
export function buildStandardRequest(opts: GenerationOptions): StandardRequest {
  const inputs: StandardRequest['inputs'] = { images: [{ upload_id: UPLOAD_PLACEHOLDER }] }
  const text = opts.text?.trim()
  if (text) inputs.text = text
  if (opts.subjectName?.trim()) {
    inputs.multi_subject_image = true
    inputs.subject_name = opts.subjectName.trim()
  }
  return {
    name: opts.name.trim().slice(0, 100),
    inputs,
    params: {
      mesh: { quality: opts.meshQuality ?? 'standard' },
      texture: { resolution: opts.textureResolution ?? 2048 },
      // articulated:false + collision_granularity:null = plain reconstruction (articulated is Isaac-only).
      physics: { simulator: opts.simulator ?? 'agnostic', body: 'rigid', collision: 'auto', articulated: false, collision_granularity: null },
    },
  }
}

const err = (code: string, message: string): Issue => ({ level: 'error', code, message })
const warn = (code: string, message: string): Issue => ({ level: 'warning', code, message })

/** Validate a request + the prepared image against the documented Standard contract (2026-10-21). */
export function validateStandardRequest(req: StandardRequest, image: Pick<Preparation, 'bytes' | 'issues'> & { mime: string; subjects: number }): Issue[] {
  const issues: Issue[] = []
  if (!req.name) issues.push(err('name', 'Name is required.'))
  if (req.name.length > 100) issues.push(err('name', 'Name is limited to 100 characters.'))
  if (!Array.isArray(req.inputs.images) || req.inputs.images.length !== 1) issues.push(err('images', 'Standard accepts exactly ONE image (no multi-view).'))
  if (req.inputs.text !== undefined && !req.inputs.text.trim()) issues.push(err('text', 'Text must be non-blank when present.'))
  if (req.inputs.text && req.inputs.text.length > 10000) issues.push(err('text', 'Text is limited to 10,000 characters.'))
  if (req.inputs.text) issues.push(warn('text-edits', 'With an image, text is applied as EDITS to the image. Leave it empty to model the artwork as drawn.'))
  if (req.inputs.multi_subject_image && !req.inputs.subject_name?.trim()) issues.push(err('subject', 'Multi-subject mode needs a subject name.'))
  if (!Object.values(MIME).includes(image.mime)) issues.push(err('mime', `Image type ${image.mime} is not PNG, JPEG or WebP.`))
  if (image.bytes > PROVIDER_MAX_BYTES) issues.push(err('bytes', 'Image is over 100 MB.'))
  if (image.subjects === 0) issues.push(err('no-subject', 'The prepared image has no detectable subject.'))
  if (image.subjects > 1 && !req.inputs.multi_subject_image) issues.push(err('multi-subject', `${image.subjects} subjects detected: crop to one, or set a subject name.`))
  for (const i of image.issues) if (i.level === 'error') issues.push(i)
  const p = req.params
  if (!['standard', 'low', 'ultra_low'].includes(p.mesh.quality)) issues.push(err('mesh', 'mesh.quality must be standard, low or ultra_low.'))
  if (![2048, 4096, 8192].includes(p.texture.resolution)) issues.push(err('texture', 'texture.resolution must be 2048, 4096 or 8192.'))
  if (p.physics.simulator !== 'agnostic') issues.push(err('simulator', 'This studio consumes GLB, which only physics.simulator=agnostic returns.'))
  if (p.physics.articulated !== false || p.physics.collision_granularity !== null) issues.push(err('articulated', 'Articulated generation is Isaac/USD only; use articulated:false, collision_granularity:null.'))
  if (JSON.stringify(req).includes('TODO')) issues.push(err('todo', 'Request still contains TODO placeholders.'))
  return issues
}

/** Canonical JSON (sorted keys) so the same request always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

/** What the approval binds to: endpoint + exact request + the image bytes' hash. */
export function payloadDigestInput(endpoint: string, req: StandardRequest, imageSha256: string) {
  return canonicalJson({ endpoint, request: req, imageSha256 })
}

export const approvalPhrase = (credits: number) => `SPEND ${credits} CREDITS`

export class ApprovalError extends Error {}

export interface ApprovalInput {
  phrase: string
  acknowledgeCredits: boolean
  acknowledgeLicence: boolean
  confirmNoCardOnFile: boolean
}

/** Build an approval for a validated generation, or throw explaining what is missing. */
export function approve(g: Generation, input: ApprovalInput, now: Date): Approval {
  if (g.status !== 'validated') throw new ApprovalError(`generation is ${g.status}; only a validated dry-run can be approved`)
  if (!g.dryRun.ok) throw new ApprovalError('dry-run has errors')
  if (input.phrase.trim() !== approvalPhrase(g.credits)) throw new ApprovalError(`type exactly: ${approvalPhrase(g.credits)}`)
  if (!input.acknowledgeCredits) throw new ApprovalError('acknowledge the credit cost')
  if (!input.acknowledgeLicence) throw new ApprovalError('acknowledge the Kaedim licence terms (section 4.2)')
  if (!input.confirmNoCardOnFile) throw new ApprovalError('confirm no payment card is on file (overage starts a paid plan)')
  return {
    at: now.toISOString(), expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    payloadHash: g.payloadHash, credits: g.credits, phrase: input.phrase.trim(),
    acknowledgements: { credits: true, licence: true, noCardOnFile: true },
  }
}

/**
 * The last gate before money moves. `currentHash` is recomputed from the manifest + image bytes on
 * disk at submit time, so editing the request or swapping the image after approval invalidates it.
 */
export function assertSubmittable(g: Generation, currentHash: string, now: Date) {
  if (g.submission) throw new ApprovalError('already submitted; never re-sent')
  if (g.status !== 'approved' || !g.approval) throw new ApprovalError('not approved')
  if (g.approval.payloadHash !== currentHash || g.payloadHash !== currentHash) throw new ApprovalError('payload changed since approval; dry-run and approve again')
  if (g.approval.credits !== g.credits || g.credits !== CREDITS[g.endpoint]) throw new ApprovalError('credit amount changed since approval')
  if (now.getTime() > Date.parse(g.approval.expiresAt)) throw new ApprovalError('approval expired; approve again')
}
