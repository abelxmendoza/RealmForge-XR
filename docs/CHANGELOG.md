# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Landing page "Watch it in action" section: four scripted replays of the real editor (build a scene, robot replan, job fair attendee, VR grab in an emulated Quest 3). Re-record with `npm run demos:record`.

### Fixed

- Landing page crashed on load: the Install app button's component was lost in a merge.

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
