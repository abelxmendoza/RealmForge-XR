/** Browser client for /api/creative/* (tools/creative/http.ts). */
import type { AssetManifest, Generation, StandardRequest } from '../manifest'
import type { BudgetStatus } from '../credits'
import type { Issue } from '../imageInfo'
import type { PrepOp } from '../pixels'
import type { GenerationOptions, ApprovalInput } from '../generation'

export interface StudioStatus {
  budget: BudgetStatus & { external: { file: string; committedEntries: number }[]; overageWarning: string }
  token: { configured: boolean; looksValid: boolean; source: string; error?: string }
  spendEnabled: boolean
  libraryRoot: string
}

export interface DryRunPreview {
  endpoint: string
  steps: string[]
  body: StandardRequest
  imagePlaceholder: string
  credits: number
  budgetBefore: number
  budgetAfter: number
  approvalPhrase: string
  licence: { name: string; termsUrl: string; summary: string; giftCreditOutputsPaid: string }
  overageWarning: string
  spendEnabledOnServer: boolean
}

export class ApiError extends Error {
  readonly status: number
  readonly details?: unknown
  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

const H = { 'X-Creative-Client': '1' }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/creative/${path}`, { ...init, headers: { ...H, ...(init.headers as Record<string, string>) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? res.statusText, res.status, body.details)
  return body as T
}
const meta = (m: unknown) => ({ 'X-Creative-Meta': encodeURIComponent(JSON.stringify(m)) })
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

export const api = {
  status: () => call<StudioStatus>('status'),
  list: () => call<{ assets: AssetManifest[] }>('assets').then((r) => r.assets),
  get: (id: string) => call<AssetManifest>(`assets/${id}`),
  fileUrl: (id: string, rel: string) => `/api/creative/assets/${id}/file?path=${encodeURIComponent(rel)}`,
  importArtwork: (file: Blob, sourceName: string, title?: string) =>
    call<{ manifest: AssetManifest; duplicate: boolean }>('import', { method: 'POST', body: file, headers: meta({ sourceName, title }) }),
  addPreparation: (id: string, png: Blob, parent: string, ops: PrepOp[]) =>
    call<AssetManifest>(`assets/${id}/preparations`, { method: 'POST', body: png, headers: meta({ parent, ops }) }),
  importModel: (id: string, glb: Blob, sourceName: string) =>
    call<{ manifest: AssetManifest }>(`assets/${id}/model`, { method: 'POST', body: glb, headers: meta({ sourceName }) }),
  setPreview: (id: string, png: Blob) => call<AssetManifest>(`assets/${id}/preview`, { method: 'POST', body: png }),
  verify: (id: string) => call<{ files: { file: string; ok: boolean; readOnly: boolean }[] }>(`assets/${id}/verify`),
  dryRun: (id: string, preparationId: string, options: GenerationOptions) =>
    call<{ manifest: AssetManifest; generation: Generation & { dryRun: { issues: Issue[] } }; preview: DryRunPreview }>(`assets/${id}/dry-run`, post({ preparationId, options })),
  approve: (id: string, gid: string, input: ApprovalInput) => call<AssetManifest>(`assets/${id}/generations/${gid}/approve`, post(input)),
  submit: (id: string, gid: string) => call<AssetManifest>(`assets/${id}/generations/${gid}/submit`, { method: 'POST' }),
  refresh: (id: string, gid: string) => call<{ manifest: AssetManifest; status: string }>(`assets/${id}/generations/${gid}/refresh`, { method: 'POST' }),
}
