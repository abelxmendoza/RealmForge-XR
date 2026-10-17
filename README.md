# RealmForge XR

A browser-based spatial worldbuilding sandbox for desktop, VR and passthrough AR. Build a city, Mars outpost or warehouse; populate it with workers, courier robots and utility vehicles; and watch routes adapt as you change the layout. Built for the MOLTEN Hackathon, Worldbuild track.

## Scope and capabilities

### Build and customize worlds

- Start from **Forge District**, **Mars Outpost**, **Autonomous Warehouse**, **Job Fair**, or **Empty**.
- Place buildings, draw walls and roads/platforms, and add trees, streetlights and crates.
- Move, rotate, resize and duplicate objects. Customize colors, seven surface materials, tower/office/house/industrial building styles, flat/pitched roofs and round/pine trees.
- Use exact inspector dimensions, grid and 15° angle snapping, visual selection handles, brush defaults, and undo/redo with each drag recorded as one edit.
- Author an **80 × 80 metre** map. Switch its presentation between **Tabletop 1:60**, **Room 1:20**, **Large 1:4** and **Life size 1:1** without changing saved dimensions or navigation coordinates.

### Lay out warehouse equipment and destinations

The object catalog contains storage racks, workstations, conveyors, cargo containers, safety barriers, loading bays, pickup zones, delivery zones, charging pads and inspection points. Placement previews validate bounds and solid overlaps. Assets retain their catalog identity through duplication, history and saves.

Destination markers provide selectable routes for the original robot or the selected actor. The warehouse template includes equipment and seeded destinations for trying the workflow immediately.

### Animate actors and test navigation

- Keep the original robot and add up to **32 actors**: workers, courier robots and utility vehicles, each with a procedural model.
- Configure each actor’s name, color, dimensions and speed; select, duplicate, stop or delete it; set a ground destination or dispatch it to a catalog marker.
- Routes use an obstacle occupancy grid, eight-connected **A*** and line-of-sight smoothing. Actor clearance depends on footprint size; obstacle edits trigger replanning.
- Inspect navigation status and use **Block route** to demonstrate a route adapting to an edit.

This is a world-authoring and pathfinding sandbox. Actors do not avoid each other, simulate vehicle steering or physics, carry cargo or perform jobs. Pickup, delivery, charging and inspection are navigation destinations; battery simulation, moving conveyors and automatic task sequencing are future work.

### Create on desktop and in WebXR

- Desktop: mouse/keyboard tools, inspector, right-click World actions menu, actor controls, one Worlds library for templates/saves and an optional voice panel.
- VR/AR: hand/controller grabs, twist to rotate, two-hand object scaling, and table-edge grabs to move or turn the whole map.
- Turn your left palm toward your face for the wrist menu. The floating control palette offers tools, worlds/saves, object edits, brush defaults, assets, routes and actors, with in-headset confirmations.
- Toggle rays, real/virtual ground, world scale and recentering. In AR, **Place city** pins the map to a detected Space Setup table/floor plane, using an anchor when available. AR startup retries with reduced feature requirements.
- Open the shared **Guide** from desktop, wrist menu or palette for controls and comfort tips.

Immersive features require a compatible WebXR browser and secure context. Physical Quest validation, hand interaction comfort and microphone behavior remain ongoing; support varies by headset and browser. The standalone `/xr-test/` harness is separate from the main editor.

### Use spoken or typed commands

Optional AssemblyAI streaming speech recognition supports start/stop and hold-to-talk. A typed command fallback uses the same deterministic parser and shared world actions.

Commands include loading templates, choosing tools, saving, undo/redo, setting a destination and starting navigation. Object commands can create up to 25 objects per command, use counts/styles/relative locations, and move, rotate, resize or duplicate the selected object or last-created group. Try “add three trees near the robot”, “move them five meters north”, or “make them taller”. Destructive operations use confirmation.

This is a bounded command grammar, not free-form AI world generation. Live transcription needs microphone permission, network access and a server-side AssemblyAI key. The included token endpoint runs in the Vite development server; production speech needs an equivalent server endpoint. See [voice setup and integration](docs/voice-commands.md); the current object grammar lives in `src/voice/objectCommands.ts`.

### Save, share and recover edits

The local world library supports named saves, save-as-new, confirmed overwrite/load, rename and delete, plus unsaved-change indicators. Desktop JSON import/export lets you move worlds between browsers or machines. Imports validate data and report repairs. Saves include catalog metadata and actor settings, live positions, headings and destinations; loaded actors resume routing. Older version-1 worlds without actors remain supported.

Storage is browser-local, with no account, cloud sync or multiplayer service. Save explicitly before leaving; clearing browser storage removes local saves. Undo/redo is session history, and movement frames do not add history entries. See [world persistence](docs/world-persistence.md) and [actors](docs/actors.md).

### Connect optional motion capture

The Rokoko Smartsuit Pro bridge relays Studio JSON v3 frames from UDP to WebSocket and renders a debug skeleton at room scale or inside the world. A synthetic walking skeleton works without a suit.

```bash
npm run mocap:mock    # synthetic frames
npm run mocap:bridge  # real Studio stream (instead of mock)
```

Run alongside the development server and enable **Mocap** in the HUD/wrist menu. The mock pipeline has been tested; a real suit, joint mapping and axis conversion still need validation. Avatar retargeting, finger/prop tracking and mocap-driven interactions are future work. See [Smartsuit setup](docs/smartsuit.md).

## Run locally

```bash
npm install
npm run dev          # HTTPS on localhost:5173 and your LAN address
npm test             # world, actors, navigation, voice, persistence, XR and landing tests
npm run build        # TypeScript checks and production bundle
npm run preview      # preview the built app
```

Use a recent Node.js runtime that can run the motion-capture bridge’s TypeScript file directly if using that optional bridge.

The root URL opens the landing page. **Launch editor** opens `?editor=1`; template links open `?editor=1&world=forge-district`, `mars-outpost` or `warehouse`. The editor and Three.js/WebXR modules load on demand.

On a compatible Quest, open `https://<laptop-LAN-IP>:5173` in Quest Browser, accept the development certificate, launch the editor and choose **Enter AR** or **Enter VR**. Configure Space Setup surfaces to try AR placement. See [Quest testing](docs/quest2-testing.md) and [demo readiness](docs/demo-readiness.md).

## Controls

| Control | Action |
| --- | --- |
| 1–8 | Select/move, wall, building, destination, robot, platform/road, decoration, catalog |
| Ground drag | Orbit on desktop; middle-drag pans |
| Right-click | Open desktop World actions |
| Selection handles | Yellow: resize; blue: rotate; green: duplicate; purple: material/style; red: delete |
| R / Shift+R | Rotate ±15°; with catalog tool, rotate the placement preview |
| [ / ] | Lower/raise selected object height |
| D / M / T | Duplicate / cycle material or style / toggle building roof |
| Delete / Backspace | Delete selected object |
| G / B | Toggle snapping / block-route demo |
| X / V | Toggle XR rays / real versus virtual ground |
| Ctrl/Cmd+S | Save world |
| Ctrl/Cmd+Z / Shift+Z; Ctrl/Cmd+Y | Undo / redo |
| ? | Open/close user and controls guide |
| Escape | Clear object selection |

Use **Place city** in AR for surface placement. The inspector and actor panel provide exact settings; the in-app Guide explains hand grabs, wrist controls and floating-panel use.

## Environment and optional services

Shared secrets live in `.env`, committed **encrypted** with [dotenvx](https://dotenvx.com). `npm run dev` decrypts them when the private key is available.

- Obtain `DOTENV_PRIVATE_KEY` privately from the project maintainer and put it in gitignored `.env.keys`, or export it in your shell. Never commit it.
- Set a shared variable with `npm run env:set -- NAME value`, then commit the encrypted `.env`.
- `ASSEMBLYAI_API_KEY` stays server-side; never put a permanent service key in a `VITE_*` variable. Temporary tokens are issued through `/api/assemblyai/token`.
- `VITE_MOCAP_URL` optionally overrides the browser WebSocket endpoint. The default `/mocap` uses the development proxy; deploy a relay/proxy separately for hosted mocap.
- Bridge defaults: UDP `14043`, WebSocket `14044`; override with `MOCAP_UDP_PORT` / `MOCAP_WS_PORT` and adjust the proxy when needed.
- `KAEDIM_API_TOKEN` is unused: generated external 3D assets are not an implemented feature.

## Architecture and data contract

React + TypeScript + Vite power the UI; Three.js, React Three Fiber, Drei and React Three XR render the scene and immersive interactions. Zustand holds shared state. Desktop, XR and voice actions operate on the same world.

| Area | Implementation |
| --- | --- |
| Landing and lazy editor entry | `src/landing/`, `src/main.tsx`, `src/editor/EditorEntry.ts` |
| World schema, store, spawning and actions | `src/world/types.ts`, `store.ts`, `spawn.ts`, `actions.ts` |
| Catalog, placement and destinations | `src/world/assets.ts`, `assetActions.ts`, `assetTypes.ts` |
| Presets and environment appearance | `src/world/presets.ts`, `environment.ts` |
| Actor authoring, runtime and rendering | `src/actors/` |
| Obstacle grid, A* and original robot | `src/nav/`, `src/agent/Robot.tsx` |
| Serialization, browser library and history | `src/world/serialize.ts`, `persistence.ts`, `library.ts`, `history.ts` |
| Desktop tools, inspector and grabs | `src/editor/` |
| XR session, placement, palette and guide | `src/xr/`, `src/guide/` |
| Presentation scale, lighting and procedural structures | `src/scene/` |
| Speech parsing and execution | `src/voice/`, `vite/assemblyaiTokenPlugin.ts` |
| Mocap parser, client, skeleton and relay | `src/mocap/`, `tools/mocap-bridge.ts` |

Store, navigation and versioned `realmforge-world` JSON use metres. The map spans −40…40 on x/z with 0.5 m grid cells; presentation scaling never rewrites world coordinates. Objects have stable IDs, a base-centre position, local dimensions and yaw, with optional appearance, solidity and catalog/destination metadata. Actors have their own schema and optional field in version-1 saves.

`blocksNavigation()` is the shared collision policy: explicit `solid` overrides defaults; walls/buildings block, platforms taller than 0.3 m block, and decorations are otherwise walkable. Geometry edits rebuild navigation; rendering and XR coordinate conversion use the common world root.

## Project documentation

| Guide | Coverage |
| --- | --- |
| [Environments](docs/environments.md) | Templates and visual themes |
| [Warehouse catalog](docs/warehouse-catalog.md) | Equipment, previews and destination workflows |
| [Actors](docs/actors.md) | Actor authoring, routing, persistence and limits |
| [Controls guide](docs/controls-guide.md) | Shared desktop/headset help |
| [VR/AR palette](docs/vr-control-palette.md) | Immersive controls and confirmations |
| [XR world actions](docs/xr-world-actions.md) | Shared action API |
| [World persistence](docs/world-persistence.md) | Saves, import/export and history |
| [Voice commands](docs/voice-commands.md) | Speech setup and integration |
| [Smartsuit](docs/smartsuit.md) | Optional Rokoko bridge and mock |
| [Landing page](docs/landing-page.md) | Entry routes, loading and accessibility |
| [Quest testing](docs/quest2-testing.md) / [Demo readiness](docs/demo-readiness.md) | Hardware setup and validation limits |
| [Plan](docs/plan.md) / [Build log](docs/BUILD_LOG.md) / [Changelog](docs/CHANGELOG.md) | Roadmap and development record |
| [Runtime state](docs/STATE.md) / [Integration handoff](docs/unified-integration.md) | Historical integration notes; consult source for current schema and scale |
