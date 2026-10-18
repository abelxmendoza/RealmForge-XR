# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Each new XR session starts with the palette open at your side.
- Headset panels that look like the desktop HUD: one renderer (`src/xr/panel/`) paints the palette, guide, wrist menu and error fallback with the HUD's CSS values; the palette has the HUD's six tabs, sub-pages with ‹ Back, Home, Exit VR, Collapse and Close.
- Always a way back in VR: palette ‹ Back, wrist Menu / Hide all / ‹ Back / Home / Exit VR, and voice “go back”, “hide / show the menu”, “hide everything”, “open the object catalog”, “exit VR”.
- Voice route stops: “add a waypoint at the goal / near the robot / 10 meters north of the robot / here”, “remove the last waypoint”, “clear the waypoints”, “start / pause / stop the route”, “next stop”.
- Controllers: Y pins the wrist menu open (Y again hides it).
- `npm run test:xr`: the built app in a simulated Quest 3 (Meta's IWER emulator) — enters VR, presses buttons with a controller ray, checks state, console and screenshots.
- Error boundary per XR menu (Try again / Exit VR / Reload); Enter VR failures show in the HUD.

- Easier delete: press B / Y while holding an object with a controller to delete it; every delete (red cube, wrist menu, keys, voice, B / Y) gives a distinct double buzz.
- Voice delete understands “delete it”, “remove that”, “get rid of them”, “trash this” and a bare “delete”; “them” deletes what the last command made. No confirm dialog: one undo restores it.
- Multi-section property scans: named rooms/areas, floor elevation and labels, shared web/XR alignment, visibility/solo, clipping, and two-point scale calibration.
- Portable `.rfproperty` bundles include original mesh assets for cross-device viewing; imports preserve saved worlds' files through remapped IDs.
- Backward-compatible single-scan loading, per-section runtime status/dirty tracking, aggregate import limits, and hidden-section GPU cleanup.
- XR Property scans pages (align, display, measure) with an explicit exit to browser file controls.

### Fixed

- The headset froze when anything asked to confirm (load or replace a world, overwrite a save, leave with unsaved changes) or when the guide was opened: the desktop modal dialog made the page inert and swallowed every XR press. Desktop modals no longer open during XR.
- The world could go blank in the headset on a bad network: a CDN font load suspended React and hid every object. Fonts and controller models now ship with the app; menus and the world load separately.
- Two copies of three.js shipped (drei's stats-gl); deduped.
- With controllers the wrist menu popped up during a normal grip and covered the palette.
- The palette was out of reach with rays off; rays now always reach menus (the Rays setting covers the world only).
- Palette presses could fire twice when a page changed under the ray or finger (“couldn't go back”).
- Two world menus each had their own busy flag (a save could run during a load); one shared guard now.
- Palette Taller / Shorter used 0.25 m steps; now 0.5 m like the keyboard and height snapping.
- Removed dead or replaced code from the merge: EnvironmentsMenu, StartChooser, environmentMenuController, PanelMoveBar, BrandLogo3D and unused palette helpers (see `docs/merge-audit.md`).

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
