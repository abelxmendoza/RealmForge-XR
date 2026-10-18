# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Multi-section property scans: named rooms/areas, floor elevation and labels, shared web/XR alignment, visibility/solo, clipping, and two-point scale calibration.
- Portable `.rfproperty` bundles include original mesh assets for cross-device viewing; imports preserve saved worlds' files through remapped IDs.
- Backward-compatible single-scan loading, per-section runtime status/dirty tracking, aggregate import limits, and hidden-section GPU cleanup.
- XR Property scans pages with an explicit exit to browser file controls and pagination for long control lists.
- Scan walls block movement: surfaces 0.15–1.8 m above the main floor in each scan section are sampled every 10 cm and fed into the shared navigation grid, so the robot, attendees, actors and planned routes go around real walls, columns and furniture. Per-section **Walls block** switch (web and XR, saved with the world); hidden sections still block, upper floors don't. Red tiles show the blocked area while the scan panel is open.

### Fixed

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
