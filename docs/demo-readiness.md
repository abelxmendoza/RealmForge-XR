# Demo readiness — October 17, 2026

Assessment: **desktop + integrated Quest XR code is on `main`**. Physical headset PASS/FAIL is still owned by Emiliano (checklist below). Stale tunnel URLs are not kept here — start a fresh cloudflared tunnel when testing.

## What’s on `main` now

| Area | Status |
| --- | --- |
| World persistence + undo/redo | Shipped |
| Environments (Forge / Mars / Warehouse) + Environments menu | Shipped |
| Quest XR: hand grab, scale presets, wrist menu, Place city, rays/surface | Shipped |
| Immersive control palette + in-headset confirmation | Shipped |
| Molten-forge theme (web + VR) | Shipped |
| User & controls guide (web **Guide** / **?** + VR Guide) | Shipped |
| AssemblyAI voice (typed fallback + mic path) | Shipped (live mic depends on `.env.keys`) |
| Multi-actor + voice mic tile | Shipped |
| `/xr-test/` passthrough probe | Shipped |

## Automated / desktop validation

| Check | Result |
| --- | --- |
| `npm test` | PASS (212+ on current main) |
| `npm run build` | PASS |
| Desktop tools, save/load, env confirm, undo | PASS (prior sessions + regression suite) |
| Live AssemblyAI / Quest hardware | NOT TESTED until Emiliano / Agent 4 run them |

## Emiliano — Quest hardware checklist

Follow `docs/quest2-testing.md`. Run against **`main`** via `npm run dev` + tunnel or LAN.

| # | Check | Result |
| --- | --- | --- |
| 1 | Page loads; **Enter AR** (or VR) | |
| 2 | Place city + scale 1:60 → 1:1 | |
| 3 | Grab building; robot replan when path blocked | |
| 4 | Wrist menu + **Guide**; control palette **Guide** | |
| 5 | Load env confirm (Mars / Warehouse / Forge) | |
| 6 | Usable FPS at 1:1 Forge; clean exit XR | |

On FAIL: headset + browser version, Space Setup notes, step, expected vs actual, console if available.

## Ownership (remaining)

| Owner | Task |
| --- | --- |
| Emiliano | Physical Quest checklist PASS/FAIL on `main`; review branch `Gesture/Refinement-Implementation` (hand/controller refinements — not merged yet) |
| Abel | Production voice token route if deploying beyond Vite; demo script |
| Chris | Desktop rehearsal (Guide, env menu, save/load, typed voice) |

Optional: ElevenLabs playback (not implemented). Does not block desktop demo. Stale feature branches besides Gesture were deleted after merge.
