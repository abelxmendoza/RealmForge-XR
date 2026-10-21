# Build log

Append-only diary of what we built. Newest entries at the top.
Pair each entry with CHANGELOG (user-facing) and STATE (runtime) updates when state changes.

## Template

```
### YYYY-MM-DD — short title
- **Who:** name(s)
- **Phase:** 0 | 1 | 2 | 3 (see plan.md)
- **Did:** …
- **Why:** …
- **Commit / PR:** …
- **Verified:** desktop tests / Quest 2 / Quest 3S / skipped
- **Follow-ups:** …
```

---

### 2026-10-21 — Accounts, roles and sign-in

- **Who:** Claude Code (with Abel)
- **Phase:** 3
- **Did:** Created Supabase project `realmforge-xr` ($0/month, us-west-1); migration `supabase/migrations/20261021170000_users_and_roles.sql` (profiles, user_roles with a single-admin index, role_audit, RLS, admin-only grant/revoke, admin bootstrap only for the confirmed owner email); `src/auth/*` store + lazy Supabase adapter; AccountMenu in the landing and studio headers; `?admin=1` team page; Creative Studio gated to Developer/Admin.
- **Why:** Users and authentication, with founder/developer privileges for Abel and Emiliano and Abel as the only admin.
- **Commit / PR:** branch `feat/creative-studio` (local, not pushed)
- **Verified:** live-DB role tests in a rolled-back transaction; anonymous API probes; unit tests; browser signed-out states. Real magic-link sign-in not yet done (needs dashboard URL + SMTP steps in docs/auth.md).
- **Follow-ups:** dashboard steps 1–3 in docs/auth.md; Emiliano signs in, then the admin grants Founder + Developer; Vercel env vars when deploying.

### 2026-10-21 — Creative Studio (image-to-3D library)

- **Who:** Claude Code (session started from the px4-autonomous-mission robotics session)
- **Phase:** 3 (plan.md P2.2 Kaedim decision: integrate)
- **Did:** Audit (`docs/creative-studio/AUDIT.md`); `src/creative/*` pure core (image header/pixel checks, prep ops, manifest v1, credit accounting compatible with the PX4 ledger, Standard request validation, approval gate, GLB inspector); `tools/creative/*` Node library store, ProjectSim client (TypeScript port of the PX4 `projectsim.py` protocol), service and loopback-only HTTP routes via `vite/creativeStudioPlugin.ts`; Studio UI (`src/creative/ui/*`), viewer and gallery; gallery GLBs built from CC-BY-4.0 projectsim samples via PX4 `usd_import.read_stage` (imported read-only).
- **Why:** Personal artwork → 3D assets with strict credit control (gift credits, no balance API, $1,200/month overage risk) and visible licensing (Kaedim terms 4.2).
- **Commit / PR:** branch `feat/creative-studio` (local, not pushed)
- **Verified:** `npm test` 66 files / 468 tests; `tsc -b`; `vite build`; browser pane import → prepare → dry run on a scratch library; headless Chrome (SwiftShader) for viewer controls and gallery. **No real generation submitted.**
- **Follow-ups:** pick the first six artworks (cost table in `docs/creative-studio/CREDITS.md`); confirm gift-credit outputs count as "paid" (terms 3.1); propose a shared `projectsim-guard` package (AUDIT.md).

### 2026-10-17 — Tie up loose ends (prop spawn + docs)

- **Who:** Cursor agent
- **Phase:** wrap-up
- **Did:** Wired voice/`spawnObjects` for `kind: 'prop'` via event `catalogId`; added venue vocab (booth, desk, stage, …) + tests. Documented remaining workstream `Gesture/Refinement-Implementation`. Prior pass closed stale drafts #7/#9 and refreshed readiness docs (venue MVP already on `main`).
- **Verified:** `npm test` on cleanup branch.
- **Follow-ups:** Emiliano Quest hardware checklist; review/merge Gesture branch when ready; optional ElevenLabs.

### 2026-10-17 — Project loose-end cleanup

- **Who:** Cursor agent
- **Phase:** wrap-up
- **Did:** Closed stale draft PRs #7 and #9 (already on `main`). Refreshed `demo-readiness`, `CHANGELOG`, `STATE`, `README`, `unified-integration` historical banner, and `examples/xr-menu-integration.ts` to match production wrist/palette/guide.
- **Why:** Docs and open PRs still described pre-merge Quest/voice state.
- **Verified:** `npm test` 212 pass on cleanup branch base.
- **Follow-ups:** Emiliano Quest hardware checklist; optional ElevenLabs.

### 2026-10-17 — Phase 1 P0: AR fallback + place city

- **Who:** Cursor agent (Abel + Emiliano integration)
- **Phase:** 1
- **Did:**
  - Added `src/xr/session.ts`: Emiliano’s three-step `requestSession` fallback, bind to Three `WebXRManager`, session meta in Zustand.
  - Added `src/xr/placement.ts` + `WorldPlacement.tsx`: Place city mode shows detected planes, pins miniature on table/floor click, creates WebXR anchor when available.
  - Wired HUD: Enter AR (fallback), Place city / Unpin, status for attempt + surface; key `P`.
  - `createXRStore({ offerSession: false, planeDetection, anchors, … })`.
  - Main-app Quest 2 checklist in `docs/quest2-testing.md`; unit tests for attempt order + plane helpers.
- **Why:** Demo-critical path — Quest 2 must enter AR and sit the city on a real table without depending on `/xr-test/`.
- **Commit / PR:** PR #2 (follow-up on `cursor/merge-quest2-testing-96f4`)
- **Verified:** `npm test` (21) + `npm run build` green; headset smoke still pending on device
- **Follow-ups:** Quest 2 manual checklist; Phase 2 XR-safe Forge confirm

### 2026-10-17 — Merge + living docs

- **Who:** Abel (product) + Emiliano (headset) combined via Cursor agent
- **Phase:** 0
- **Did:** Merged `quest2-testing` into Abel’s `main` on branch `cursor/merge-quest2-testing-96f4` (PR #2). Resolved README conflict by keeping Quest 2 section and Environment variables. Added `docs/plan.md`, `CHANGELOG.md`, `BUILD_LOG.md`, `STATE.md` and README links.
- **Why:** Coexist both feature sets and start documenting work + state as we integrate.
- **Commit / PR:** PR https://github.com/abelxmendoza/RealmForge-XR/pull/2
- **Verified:** merge conflict check only; headset not re-run in this session
- **Follow-ups:** Merge PR #2; implement P0.1 session fallback on `/`
