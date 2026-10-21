# Best-of-both plan

Combine Abel’s worldbuilding product with Emiliano’s Quest 2 headset truth.
Branch context: merge PR [#2](https://github.com/abelxmendoza/RealmForge-XR/pull/2) (`cursor/merge-quest2-testing-96f4`).

## North star

- **Product (Abel):** tabletop miniature world + tools + robot nav + Forge District.
- **Headset truth (Emiliano):** reliable AR on Quest 2, plane/mesh snap, grab scale-lock, anchors, tunnel/USB setup.
- **Integration rule:** keep the miniature editor; use Emiliano’s patterns as the **room/table placement layer** for `WORLD_ROOT`. Do not collapse `/` into `/xr-test/`.

## What we keep as-is

| Keep | Why |
| --- | --- |
| `src/world/*`, editor, nav, Forge preset | Core demo product |
| Map-grid snap (`snap.ts`) | Editing precision on the miniature |
| `/xr-test/` standalone page | Isolate headset bugs from world/nav regressions |
| `docs/quest2-testing.md` | Headset setup + checklist |
| dotenvx `.env` | Shared secrets without committing keys |
| cloudflared `allowedHosts` | Venue Wi‑Fi path for both pages |

## What we port / build

| # | Feature | Source | Target | Done when |
| --- | --- | --- | --- | --- |
| P0.1 | AR session feature fallback (full → no depth → minimal) | `xr-test/main.js` `ATTEMPTS` | `src/xr/session.ts` + HUD Enter AR | Quest 2 can enter AR without mesh/depth |
| P0.2 | Pin `WORLD_ROOT` to a Space Setup table plane + optional anchor | xr-test planes / anchors | `src/xr/placement.ts` + `WorldPlacement.tsx` | City sits on a real table; survives brief tracking loss |
| P0.3 | Document main-app Quest 2 smoke path | quest2 docs | `docs/quest2-testing.md` + README | Checklist covers `/` not only `/xr-test/` |
| P1.1 | XR-safe world actions (load Forge, confirm) | Inspector DOM gaps | In-world or HUD confirms usable with hands | No `window.confirm` required in headset |
| P1.2 | Validate ray-drag vs grab for selected objects on Quest 2 | xr-test grab | Keep ray-drag unless grab wins in tests | Decision recorded in BUILD_LOG + STATE |
| P1.3 | Keep `/xr-test/` checklist green as manual gate | Emiliano checklist | Pre-demo ritual | Every demo day runs the checklist |
| P2.1 | World export / import persistence | store `WorldSnapshot` | JSON download + load | Demo can restore a built city |
| P2.2 | Kaedim token usage or remove (**done 2026-10-21: Creative Studio**) | `.env` `KAEDIM_API_TOKEN` | Integrate or drop from env docs | No dead secrets |
| P2.3 | Quest 3S mesh snap + depth occlusion polish | xr-test mesh/depth | Optional after Quest 2 path is solid | Demo looks correct on 3S |
| P3.1 | In-XR capability / fps strip | xr-test HUD | Optional debug overlay on `/` | Diagnose venue issues without leaving AR |

## Architecture (target)

```
Desktop / Quest Browser
        │
        ├─ /              React + R3F + Zustand (product)
        │     ├─ editor tools (map-grid snap)
        │     ├─ WORLD_ROOT placement (plane snap + anchor)  ← from xr-test
        │     ├─ session fallback enterAR                    ← from xr-test
        │     └─ robot nav (unchanged)
        │
        └─ /xr-test/      Vanilla Three smoke harness (keep)
              grab, planes, mesh, anchors, fps
```

Scale stays intentional: store coords are map-local; `WORLD_ROOT.scale = 0.07` is the tabletop. Placement moves the root in room space; it does not rescale the map to true-scale.

## Phases

### Phase 0 — Docs + baseline (this commit)

- [x] Merge both branches (PR #2)
- [x] Living docs: `plan.md`, `CHANGELOG.md`, `BUILD_LOG.md`, `STATE.md`
- [ ] Merge PR #2 to `main`
- [ ] Both teammates can run `npm run dev` with dotenv key + open `/` and `/xr-test/` on Quest 2

### Phase 1 — Demo-critical XR (P0)

1. [x] Port session fallback into main app (`src/xr/session.ts` + Enter AR button).
2. [x] Add “place city on table” interaction (planes → pin `WORLD_ROOT` → optional anchor).
3. [x] Extend Quest 2 checklist for `/` in `docs/quest2-testing.md`.
4. [x] Update BUILD_LOG, CHANGELOG, STATE; unit tests + production build green.
5. [ ] Headset smoke on Quest 2 (manual — see main-app checklist).

### Phase 2 — Interaction parity (P1)

1. XR-safe Forge load / destructive confirms.
2. Quest 2 playtest: ray-drag vs grab; record decision.
3. Ritualize `/xr-test/` checklist before venue demos.

### Phase 3 — Depth (P2–P3)

1. World JSON export/import.
2. Kaedim decision.
3. 3S mesh/depth polish + optional in-XR debug strip.

## Working agreement (document as we go)

Every meaningful change updates **three** living docs in the same PR/commit when possible:

1. **`docs/BUILD_LOG.md`** — what we did, who, why, links to commits.
2. **`docs/CHANGELOG.md`** — user-facing / demo-facing delta (Keep a Changelog style).
3. **`docs/STATE.md`** — runtime & data state: store fields, XR session modes, placement/anchor status, geometryVersion semantics, breaking schema notes.

Rules:

- One phase lever at a time when integrating XR into the product (easier to blame regressions).
- Prefer porting **patterns** from `xr-test/main.js` into typed modules under `src/` over copying the whole harness.
- `/xr-test/` remains a smoke page; do not make the product depend on it at runtime.
- If a decision changes scale, snap layers, or session features, log it in STATE **before** merging.

## Success criteria (hackathon demo)

1. Quest 2: enter AR on `/`, pin city to table, edit with tools, robot paths, replan when a wall moves.
2. Quest 3S: same flow with better passthrough; mesh/depth optional polish.
3. Desktop: full editor + Forge District still works offline.
4. Docs tell a new teammate how to get on headset in one page.
5. BUILD_LOG / CHANGELOG / STATE reflect the current build without archaeology in git alone.
