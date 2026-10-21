# ProjectSim credits — budget and accounting

## Account (gift credits)

| | |
| --- | --- |
| Gift credits | 120, expire **2026-11-18** |
| Dashboard snapshot (2026-10-21, pasted by the account owner) | **10 of 120 used, 110 left** |
| Matches local ledgers? | Yes: the PX4 ledger has one intent: `e1_shelving_bays`, procedural set, 10 credits. The creative ledger is empty |
| Balance API | None. The dashboard is the source of truth; the ledgers give a conservative local upper bound |
| Overage risk | If a payment card is on file, going past the gift credits starts a **$1,200/month** plan. Confirm that no card is attached (the approval form asks every time) |

## Agreed split (in principle)

| Use | Credits | State |
| --- | --- | --- |
| E1 shelving (PX4, procedural ×10) | 10 | committed, generating |
| B1–B3 robotics batches (PX4) | 64 | proposed, **not approved** |
| Creative Studio: six Standard generations | 24 | allocation; **nothing spent** |
| Contingency | 22 | held back |

The studio enforces its part in code (`src/creative/credits.ts`, `DEFAULT_BUDGET`):

* creative allocation: 24 credits committed by this studio, at most;
* account holdback: committed credits across **all** ledgers + the new cost must stay ≤ 120 − 22 = 98.

Pending intents count as spent until refunded. Today: account committed 10, creative 0,
**24 available to the studio**.

## Pricing (verified 2026-10-21)

| Endpoint | Credits |
| --- | --- |
| Standard (image or text → one object) | 4 |
| Measured | 4 |
| High-fidelity variation set | 4 per member |
| Procedural variation set | 1 per member, 10 minimum |

Failed jobs are refunded. Uploads and polling are free.

## Cost of the first six creative generations

| Item | Endpoint | Credits | Running total (creative) | Account committed after |
| --- | --- | --- | --- | --- |
| Artwork 1 | Standard | 4 | 4 | 14 |
| Artwork 2 | Standard | 4 | 8 | 18 |
| Artwork 3 | Standard | 4 | 12 | 22 |
| Artwork 4 | Standard | 4 | 16 | 26 |
| Artwork 5 | Standard | 4 | 20 | 30 |
| Artwork 6 | Standard | 4 | 24 | 34 |

Each one is approved separately; none is sent automatically. A re-run (for example after a failed
or poor result) is a new 4-credit generation, so retries come out of the same 24.
