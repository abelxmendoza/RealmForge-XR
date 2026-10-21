/**
 * ProjectSim credit accounting. Pure; the ledger file I/O lives in tools/creative/ledger.ts.
 *
 * The ledger format is the SAME JSONL event stream the PX4 repo's tools/sim_assets/projectsim.py writes
 * (intent / submitted / refunded / downloaded, keyed by Idempotency-Key), so one account-wide view can
 * sum both ledgers. Every `intent` counts as spent until a `refunded` event cancels it: a crash between
 * intent and response can never hide a spend.
 *
 * There is no balance API endpoint: the ProjectSim dashboard is the source of truth. These numbers are
 * a conservative local upper bound on what has been committed, not the account balance.
 */

/** Credits per created asset (verified on docs.projectsim.ai 2026-10-21). Sets are charged per member. */
export const CREDITS = { standard: 4, measured: 4, high_fidelity: 4, procedural: 1 } as const
export type Endpoint = keyof typeof CREDITS
export const PRICING_SOURCE = 'docs.projectsim.ai/getting-started/authentication.md, verified 2026-10-21'

export interface LedgerEntry {
  utc: string
  event: 'intent' | 'submitted' | 'refunded' | 'downloaded' | string
  key?: string
  item?: string
  credits?: number
  [k: string]: unknown
}

/** Budget agreed for the gift-credit account (see docs/creative-studio/CREDITS.md). */
export interface Budget {
  accountCredits: number
  expires: string
  /** Credits this studio may commit in total (creative allocation). */
  creativeAllocation: number
  /** Account-wide credits never spendable by this studio (contingency). */
  accountHoldback: number
}

export const DEFAULT_BUDGET: Budget = { accountCredits: 120, expires: '2026-11-18', creativeAllocation: 24, accountHoldback: 22 }

export function costOf(endpoint: Endpoint, count = 1) {
  return CREDITS[endpoint] * count
}

/** Credits committed by a ledger: intents minus refunds (a refund without credits is a full refund). */
export function committed(entries: LedgerEntry[]): number {
  const intents = new Map<string, number>()
  for (const e of entries) if (e.event === 'intent' && e.key && typeof e.credits === 'number') intents.set(e.key, e.credits)
  const refunded = new Map<string, number>()
  for (const e of entries) {
    if (e.event !== 'refunded' || !e.key || !intents.has(e.key)) continue
    refunded.set(e.key, (refunded.get(e.key) ?? 0) + (typeof e.credits === 'number' ? e.credits : intents.get(e.key)!))
  }
  let total = 0
  for (const [k, c] of intents) total += Math.max(0, c - (refunded.get(k) ?? 0))
  return total
}

export interface BudgetStatus {
  creativeCommitted: number
  externalCommitted: number
  accountCommitted: number
  creativeRemaining: number
  accountSpendable: number
  /** What this studio can still commit: min(creative allocation left, account spendable). */
  available: number
  budget: Budget
  pricingSource: string
  note: string
}

export function budgetStatus(creative: LedgerEntry[], external: LedgerEntry[][], budget: Budget = DEFAULT_BUDGET): BudgetStatus {
  const creativeCommitted = committed(creative)
  const externalCommitted = external.reduce((s, l) => s + committed(l), 0)
  const accountCommitted = creativeCommitted + externalCommitted
  const creativeRemaining = budget.creativeAllocation - creativeCommitted
  const accountSpendable = budget.accountCredits - budget.accountHoldback - accountCommitted
  return {
    creativeCommitted, externalCommitted, accountCommitted, creativeRemaining, accountSpendable,
    available: Math.max(0, Math.min(creativeRemaining, accountSpendable)),
    budget, pricingSource: PRICING_SOURCE,
    note: 'Local upper bound from ledgers (pending intents count as spent). The ProjectSim dashboard is the source of truth; there is no balance API.',
  }
}

export class BudgetExceeded extends Error {}

export function assertAffordable(cost: number, status: BudgetStatus) {
  if (!Number.isInteger(cost) || cost <= 0) throw new BudgetExceeded(`invalid cost ${cost}`)
  if (cost > status.creativeRemaining) throw new BudgetExceeded(`needs ${cost} credits; creative allocation has ${status.creativeRemaining} left of ${status.budget.creativeAllocation}`)
  if (cost > status.accountSpendable) throw new BudgetExceeded(`needs ${cost} credits; account has ${status.accountSpendable} spendable after the ${status.budget.accountHoldback}-credit contingency`)
}
