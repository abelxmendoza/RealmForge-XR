# Changelog

All notable changes to RealmForge XR are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Dates are UTC.

## [Unreleased]

### Added

- Living docs for the best-of-both plan: `docs/plan.md`, `docs/BUILD_LOG.md`, `docs/STATE.md` (this file).

### Merged (awaiting `main`)

- Emiliano’s Quest 2 harness: `/xr-test/`, `docs/quest2-testing.md`, cloudflared host allowlist.
- Abel’s worldbuilding: structures, platforms, decor, grid snap, duplicate, Forge District, dotenvx `.env`.

## [0.1.0] — 2026-10-17

### Added

- App scaffold: world store, grid A* navigation, robot, pointer editor (desktop + XR rays).
- Worldbuilding kinds: wall, building, platform, tree, streetlight, crate; materials and styles.
- Forge District preset; inspector panel; map-grid snapping; demo “block route”.
- Encrypted shared env via dotenvx (`KAEDIM_API_TOKEN` present, unused in code).
- Standalone `/xr-test/` passthrough page (grab, plane/mesh snap, anchors, fps HUD).
- Quest 2 testing guide and Vite `allowedHosts` for `*.trycloudflare.com`.
