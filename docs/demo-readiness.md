# Demo readiness — October 18, 2026

Assessment: **desktop + Quest stability + sectioned HUD + demo script are on this branch**. Physical headset PASS/FAIL is still owned by Emiliano (checklist below). Stale tunnel URLs are not kept here — start a fresh cloudflared tunnel when testing.

## What’s ready for demo

| Area | Status |
| --- | --- |
| World persistence + undo/redo | Shipped |
| Environments (Forge / Mars / Warehouse) + Events (empty / job fair) | Shipped |
| Quest XR: hand grab, table-edge grab, floor snap, scale presets, Place World | Shipped |
| Immersive control palette + in-headset confirmation + Event placement | Shipped |
| Sectioned desktop HUD (Build / Edit / Plan / Simulate / View / Save) | Shipped |
| Molten-forge theme (web + VR) | Shipped |
| User & controls guide (web **Guide** / **?** + VR Guide) | Shipped |
| Voice (cloud mic + browser-speech fallback + typed) | Shipped (cloud mic needs `.env.keys`) |
| Token route for Vite **and** standalone `npm run token:serve` | Shipped |
| Demo script | `docs/demo-script.md` |
| `/xr-test/` passthrough probe | Shipped |

## Automated / desktop validation

| Check | Result |
| --- | --- |
| `npm test` | PASS (316) |
| `npm run build` | PASS |
| Desktop: landing → editor sections → Guide → env confirm → Save → Block Path | Target for Chris rehearsal |
| Quest: table-edge grab, floor snap, Event on palette, `unbounded` | Code ready — hardware PASS/FAIL still Emiliano |
| Live AssemblyAI mic | Needs `.env.keys`; typed / browser speech work without it |

## Emiliano — Quest hardware checklist

Follow `docs/quest2-testing.md`. Run against this build via `npm run dev` + tunnel or LAN.

| # | Check | Result |
| --- | --- | --- |
| 1 | Page loads; **Enter XR** (or VR) | |
| 2 | Place World + scale 1:60 → 1:1 | |
| 3 | Grab building / table rim; robot replan when path blocked | |
| 4 | Wrist menu + **Guide**; control palette **Guide** | |
| 5 | Load env confirm (Mars / Warehouse / Forge) | |
| 6 | Usable FPS at 1:1 Forge; clean exit XR | |

On FAIL: headset + browser version, Space Setup notes, step, expected vs actual, console if available.

## Ownership (remaining)

| Owner | Task |
| --- | --- |
| Emiliano | Physical Quest checklist PASS/FAIL; optional full Gesture extras still on `Gesture/Refinement-Implementation` |
| Abel | Demo script + token route shipped (`docs/demo-script.md`, `npm run token:serve`) |
| Chris | Desktop rehearsal using `docs/demo-script.md` (Guide, env menu, save/load, typed voice, Block Path) |

Optional: ElevenLabs playback (not implemented). Does not block desktop demo.
