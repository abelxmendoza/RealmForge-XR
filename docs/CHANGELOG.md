# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Sectioned desktop HUD (Build / Edit / Plan Routes / Simulate / View / Save) for first-time demo users.
- Browser SpeechRecognition fallback when AssemblyAI token/mic fails; PCM resample for laptop mics.
- Shared AssemblyAI token mint (`tools/assemblyai-token.ts`) + `npm run token:serve` for demos beyond Vite; Vite preview also serves `/api/assemblyai/token`.
- Demo script: `docs/demo-script.md`.

### Fixed

- Quest table-edge grab: Select tool no longer steals grabs from the map rim; rim is part of the grab handle; wider base.
- Room / life-size floor snap via `FloorTracker` + `unbounded` tracking (tabletop keeps table height).
- XR control palette can place Event objects; Brush cycles the event catalog.
- Click-placed crates set `solid: true` (same as voice spawn) so nav stays consistent.
- Virtual ground / table edge follow the active environment appearance.
- Docs/examples cleanup: demo readiness reflects `main`; stale “do not merge Quest” / missing XR confirm notes removed; XR menu example points at production palette + confirmation.
- Voice spawn for event `prop` objects: requires `catalogId`, wired through `propFromCatalog`; venue phrases (booth, registration desk, stage, …).


## [0.2.0] — 2026-10-17

### Added

- Quest XR on `main`: hand grab, scale presets, wrist menu, Place city, rays/surface, `/xr-test/`.
- Environments menu (Forge / Mars / Warehouse); world persistence + undo/redo.
- Immersive control palette with in-headset Confirm/Cancel.
- Molten-forge theme shared across landing, desktop HUD, wrist menu, VR palette.
- User & controls guide (web **Guide** / **?** and VR Guide panel).
- AssemblyAI voice commands + floating mic / VR voice tile; multi-actor controls.
- Desktop right-click world actions menu; asset catalog / warehouse destinations.

### Notes

- Physical Quest hardware checklist remains with Emiliano (`docs/demo-readiness.md`).
- Live mic needs dotenvx private key; ElevenLabs not implemented.

## [0.1.0] — 2026-10-17

### Added

- App scaffold: world store, grid A* navigation, robot, pointer editor (desktop + XR rays).
- Worldbuilding kinds: wall, building, platform, tree, streetlight, crate; materials and styles.
- Forge District preset; inspector panel; map-grid snapping; demo “block route”.
- Encrypted shared env via dotenvx.
- Standalone `/xr-test/` passthrough page; Quest 2 testing guide; cloudflared host allowlist.
- AR session fallback and Place city pinning.
