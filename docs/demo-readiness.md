# Demo readiness — October 17, 2026

Assessment: desktop integration is ready for rehearsal. Quest demonstration readiness is NOT established until Emiliano marks the hardware checklist below. Do **not** merge `integration/quest-xr` → `main` until that PASS.

## Live hardware session (cloud tunnel)

Branch: `integration/quest-xr` @ `a0b904a` · draft PR: https://github.com/abelxmendoza/RealmForge-XR/pull/8

| Item | Value |
| --- | --- |
| App URL (Quest Browser) | https://economics-calgary-worcester-ultra.trycloudflare.com/ |
| Passthrough probe | https://economics-calgary-worcester-ultra.trycloudflare.com/xr-test/ |
| Local Vite | `https://localhost:5173` (HTTPS, basic-ssl) |
| Tunnel | `npx cloudflared tunnel --url https://localhost:5173 --no-tls-verify` |
| Preflight | `npm test` 132/132 · `npm run build` PASS · tunnel HTTP 200 |

Open the App URL on the headset (real cert — no warning). If the page fails after a long idle, ask for a fresh tunnel URL; quick tunnels change on restart.

### Emiliano — mark PASS / FAIL / SKIP

Full gesture detail lives in `docs/quest2-testing.md`. Minimum for a claimed Quest demo:

| # | Check | Result |
| --- | --- | --- |
| 1 | Page loads; **Enter AR** starts a session (or VR fallback) | |
| 2 | **Place city** / table edge grab places the world; scale presets 1:60 → 1:1 feel correct | |
| 3 | Pinch/grip grab moves a building; robot replans when a wall crosses its path | |
| 4 | Left-palm **wrist menu** appears; poke toggles rays / Real·Virtual / Recenter | |
| 5 | Wrist or typed **Load Mars / Warehouse / Forge** shows confirm; confirm swaps env | |
| 6 | Usable FPS at 1:1 Forge District (feel or panel); no crash on exit AR | |

On FAIL: headset + browser version, room/Space Setup notes, exact step, expected vs actual, console line if available (`chrome://inspect` over USB).

## Actual validation in this session

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` | PASS | 132 tests, 17 files (integration/quest-xr) |
| `npm run build` | PASS | TypeScript + Vite; app and `/xr-test/` emitted |
| Desktop tool command | PASS | Typed “Select wall tool” showed “Command executed” and inspector “New wall” |
| Voice-command environment replacement | PASS | Typed “Load Mars Outpost” opened confirmation; confirming loaded Mars and started navigation |
| Desktop save/reload | PASS | Saved Mars, refreshed page, confirmed loading saved world; 31 objects retained |
| Environment appearance round trip | PASS (automated) | Export Mars → load warehouse → import Mars restores appearance/ID |
| Final desktop render | PASS | Loaded Mars and saved it in final build; no captured console errors; screenshot `/tmp/realmforge-integration.png` |
| Confirmation cancellation/no UI | PASS (automated) | No consumer denies; stale answer ignored; consumer removal cancels |
| Environment edit/navigation/undo | PASS (automated) | All three presets load with routes; edits replan; undo/redo preserves edits |
| Coordinate isolation | PASS (automated) | Translated, rotated, scaled tabletop converts hit to local coordinates without changing store/path |
| Missing mic permission/key | PASS (simulated) | Client tests report denied permission / missing key; no microphone request for missing key |
| Live AssemblyAI/microphone | NOT TESTED | No real mic/service session performed |
| ElevenLabs playback | NOT TESTED | No implementation available in audited work |
| Frame rate/draw calls/hand dragging | NOT TESTED | Requires relevant device and workload measurements |

Build warnings: large chunks (including XR emulation assets) and extensionless Vite plugin import. No failures. The installed npm entry point needs execution outside the restricted sandbox; required commands were actually run there. No new dependency was introduced; `npm ci --ignore-scripts` installed the existing lockfile.

## Short desktop fallback demo

1. Run `npm run dev`; open the local HTTPS URL in your browser. Static preview can demonstrate editing and typed commands, but has no voice token backend.
2. Load Forge District (or Mars Outpost); confirm replacement. Choose a building and drag it; use undo/redo.
3. Let the robot navigate. Press B while it is moving to slide an obstacle across its route and watch replan count/path change. If it has arrived, place robot and destination again before B.
4. Expand “Try a command without a microphone”. Run “Select wall tool”, then “Load Mars Outpost”; show cancel and confirm behavior.
5. Save as new. Refresh. Load the new save and confirm. Old saves without environment metadata use default appearance; saves created by this integration retain it.
6. Only if live voice is configured and tested: Start listening or hold Hold to talk; speak “Select building tool”; stop/release. If access fails, use typed commands and continue editing.

## Quest hardware record

Follow `docs/quest2-testing.md` and the live-session table above. None of these checks were performed on physical hardware in this agent session:

| Check | Status |
| --- | --- |
| XR entry / AR fallback | NOT TESTED |
| World placement / anchors | NOT TESTED |
| Hand tracking / controller input | NOT TESTED |
| Selection / movement / local coordinates | NOT TESTED |
| Robot navigation / dynamic replanning | NOT TESTED |
| XR menu actions / confirmation | NOT TESTED |
| Microphone permission in XR / commands | NOT TESTED |
| Performance / resource cleanup on device | NOT TESTED |

For a failure, record headset/browser version, environment, exact interaction, expected/actual behavior, console message and repeatable steps. No headset PASS/FAIL can be claimed until Emiliano fills the live-session table.

## Remaining ownership

| Owner | Next task |
| --- | --- |
| Abel | Review integration delta; approve merge to `main` only after Quest checklist PASS; production token backend if deploying live voice |
| Emiliano | Open live App URL on Quest; run physical checklist (table above + `docs/quest2-testing.md`); report PASS/FAIL |
| Chris | Rehearse desktop fallback; test object manipulation and persistence UX; review voice controls on target screen/headset mirror |
| Agent 2 | Review shared confirmation adapter and actions contract; verify safe target selection across asynchronous confirmations |
| Agent 4 | Run live AssemblyAI mic tests over HTTPS, including permission denial, reconnect, release during startup and XR session exit |
| Agent 3 | Supply optional stable clips/playback; consume voice events and design world/nav event adapter; debounce route announcements |

Blockers to a claimed Quest demo: hardware verification, newer XR lineage reconciliation, and in-headset confirmation/menu wiring. Optional live voice additionally needs server credentials and a verified microphone path; static production requires a token route. ElevenLabs is optional and absent. None should block a desktop submission.
