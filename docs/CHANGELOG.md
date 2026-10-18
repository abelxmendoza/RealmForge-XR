# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Easier delete: press B / Y while holding an object with a controller to delete it; every delete (red cube, wrist menu, keys, voice, B / Y) gives a distinct double buzz.
- Voice delete understands “delete it”, “remove that”, “get rid of them”, “trash this” and a bare “delete”; “them” deletes what the last command made. No confirm dialog: one undo restores it.

### Fixed

- Deleting a framed group is one undo step (was one per object).
- Landing page builds again: restored the `InstallButton` component lost in the PR #31 merge.

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
