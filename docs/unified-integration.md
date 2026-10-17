# RealmForge XR integration — October 17, 2026

> **Historical audit.** Persistence, environments, Quest XR (grab / wrist / scale), voice, control palette, forge theme, and the controls guide are **merged on `main`**. For current readiness see `docs/demo-readiness.md`. For controls UX see `docs/controls-guide.md`.

Local branch (at time of writing): `codex/unified-xr-integration`, based on voice head `ef8ddfd`.
Original checkout: `feat/world-persistence` at `cb23002`.

## Repository audit and dependency graph

GitHub metadata and fetched branch history were inspected. Main remains `bc4614d`.
All seven PRs were open at audit time; #2–#7 were drafts. Metadata saying mergeable against main does not establish compatibility between PRs.

```text
main bc4614d
├─ persistence cb23002 → #3 polish c07134d
│                         → #5 environments c550fcc
│                           → #6 actions 4517f66
│                             → #7 voice ef8ddfd (base: #6 branch)
│                               → local codex/unified-xr-integration
├─ #4 alternative persistence/history 8b490d1
├─ #2 AR fallback + placement 10eb5f9
└─ #1 quest2-testing c60934a (newer grabs, 80m world, scale, wrist menu, mocap)
```

PRs #3, #5 and #6 target main but contain earlier commits in the first chain. #7 targets `cursor/xr-world-actions-96f4`. #4 overlaps #3 rather than stacking on it. #2 includes the earlier Quest test harness; #1 has evolved substantially beyond that shared history.

Recommended review/merge order (human approval required): choose #3 as the persistence lineage, take the focused robot-preserving history fix from #4 (included locally), then #5 → #6 → #7. Review this integration delta after those dependencies. Coordinate #2/#1 consolidation with Emiliano before merging either XR lineage together. Do not merge both persistence implementations wholesale. Scene/App/Vite are known XR integration overlap points; #1 also changes world dimensions, presets, catalog and editor interactions.

## Integrated systems

| System | Local status | Limits |
| --- | --- | --- |
| World Action API | Existing #6 facade reused; desktop tool/environment controls and voice share the original store actions | Pointer editing still directly calls the same underlying store; no duplicate world state |
| Environments | Forge District, Mars Outpost, Warehouse present and tested | Blank world uses existing voice reset intent, not a fourth preset manager |
| Persistence | Save/load/import/export and coalesced undo/redo retained | Optional `environmentId` added to v1 files; older files load default appearance |
| Robot navigation | Existing A* unchanged; geometry edits replan | Undo now restores geometry without teleporting a moving robot unless robot start changed |
| Quest | Earlier #2 session/placement modules and `/xr-test/` copied unchanged; Scene/HUD wired | No physical headset verification; newer #1 wrist menu/grabs/scales intentionally not incorporated |
| AssemblyAI | Existing parser/executor/token proxy retained; desktop start/stop and hold-to-talk plus typed fallback connected | Live speech not tested; token proxy only exists in Vite dev, not static production |
| ElevenLabs | No implementation found in audited branch trees or PRs | No spoken feedback claim; integration remains optional |

AssemblyAI model `universal-3-6-pro` was verified against the live [model reference](https://www.assemblyai.com/docs/streaming/select-the-speech-model). The [token reference](https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token) supports server-minted temporary tokens. The client never reads a permanent key. No credential files were inspected or altered.

Voice changes: stable React snapshots; shared hook controller; no mock registration during render; startup deduplication/cancellation; microphone release on stop; final turn drain before Terminate; only end-of-turn transcripts execute; repeated turn IDs filtered. Failures leave editing available. Typed commands use the same parser and executor. “Place robot” and “Set destination” select tools; the next pointer interaction supplies coordinates.

## Shared confirmation and XR contract

`src/world/confirmation.ts` exposes `requestConfirmation`, `getConfirmation`, `subscribeConfirmation`, and `resolveConfirmation(id, accepted)`. Only a current request ID can resolve a pending operation. Missing UI, concurrent requests, and removal of the last UI consumer deny the operation. Status-only observers must subscribe with `consumer = false`.

Desktop uses `ConfirmationDialog` (HTML). Immersive XR uses Confirm/Cancel tiles on `ControlPalette` (and guide via `ControlsGuidePanel`). Both subscribe to `src/world/confirmation.ts`. World Action API replacement calls still pass `confirmReplace`. Core persistence does not rely on `window.confirm` for XR paths.

See `examples/unified-xr-contract.ts` and `examples/xr-menu-integration.ts` for sketches. Production menus: wrist + control palette. Use one shared voice controller; stop listening on XR session exit.

Tabletop placement stays outside the scaled world group. Store coordinates, object dimensions, occupancy grids, and paths remain local; `groundPoint` transforms pointer hits through the root matrix. Tests cover translated/rotated/scaled roots. Hardware anchor drift and hand input are not established by those tests.

ElevenLabs handoff: reuse `subscribeVoiceEvents` from `src/voice/events.ts` for command feedback. World/nav events listed in the blueprint do not yet have a unified event bus in this stack. Agent 3 should use optional pre-generated clips, emit speech only after successful actions, debounce repeated replans, release playback resources, and keep permanent keys server-side. No competing audio integration was added.

## Changed files

Integration edits: `src/App.tsx`, `src/scene/Scene.tsx`, `src/editor/Inspector.tsx`, `src/editor/WorldsPanel.tsx`, `src/style.css`, `vite.config.ts`.

Voice fixes: `src/voice/assemblyAIClient.ts`, `src/voice/voiceController.ts`, `src/voice/useVoiceCommands.ts`, `src/voice/__tests__/assemblyAIClient.test.ts`.

World fixes: `src/world/store.ts`, `src/world/history.ts`, `src/world/persistence.ts`, `src/world/serialize.ts`, `src/world/environment.ts`.

New integration files: `src/editor/VoicePanel.tsx`, `src/editor/ConfirmationDialog.tsx`, `src/world/confirmation.ts`, `src/world/integration.test.ts`, this report, `examples/unified-xr-contract.ts`, `docs/demo-readiness.md`.

Imported unchanged from #2: `src/xr/{session.ts,session.test.ts,placement.ts,WorldPlacement.tsx}`, `xr-test/{index.html,main.js}`, `docs/quest2-testing.md`.

## Verification and blockers

Results are recorded in `docs/demo-readiness.md`. Desktop browser verification used a local HTTP static build on port 4173; the HTTPS development server uses a self-signed certificate that the automation browser would not accept. No certificate warning was bypassed. Static preview has no token endpoint, so live STT must be tested on the HTTPS dev server or a production backend.

Definition of done remains incomplete until physical Quest testing. No headset, real microphone, live AssemblyAI service, ElevenLabs playback, frame timing, anchor stability, or hand-tracking performance claim is made. Bundle-size and Vite config-loader warnings remain; no speculative optimization was attempted.
