<p align="center">
  <img src="public/brand/logo-512.webp" width="160" alt="RealmForge XR logo" />
</p>

# RealmForge XR

Shape a miniature world with your hands, drop in a robot, and watch it re-route when you move a wall.
MOLTEN Hackathon, Worldbuild track. Runs in the Meta Quest browser (WebXR) and on desktop.

## Run

```bash
npm install
npm run dev        # https://localhost:5173 (and your LAN IP, for the Quest)
npm test           # grid + A* unit tests
npm run build
```

On the Quest 3S, open `https://<laptop-LAN-IP>:5173` in the Quest Browser, accept the self-signed
certificate, choose **Launch editor**, then press **Enter XR** (AR preferred; small **VR** for headset-only).

## Environment variables

Shared secrets live in `.env`, committed **encrypted** with [dotenvx](https://dotenvx.com).
`npm run dev` decrypts it automatically, as long as you have the private key.

- One-time setup: get `DOTENV_PRIVATE_KEY` from Abel (sent privately, never in git) and put it in a
  file named `.env.keys` in the repo root (`DOTENV_PRIVATE_KEY="..."`), or export it in your shell.
- Add or change a variable: `npm run env:set -- NAME value`, then commit `.env`. Teammates get it on pull.
- `.env.keys` and `*.local` are gitignored. Never commit the private key.

## Docs (living)

We document as we build. Update these in the same change when behavior or state moves:

| Doc | Purpose |
| --- | --- |
| [docs/demo-readiness.md](docs/demo-readiness.md) | What’s on `main` + Quest hardware checklist |
| [docs/controls-guide.md](docs/controls-guide.md) | Shared web/VR user & controls guide |
| [docs/quest2-testing.md](docs/quest2-testing.md) | Headset setup + gesture checklist |
| [docs/plan.md](docs/plan.md) | Best-of-both roadmap (Abel product + Emiliano headset) |
| [docs/BUILD_LOG.md](docs/BUILD_LOG.md) | Append-only work diary |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | User/demo-facing changes |
| [docs/STATE.md](docs/STATE.md) | Runtime & data state (store, XR, placement) |

## Controls

Every control is a pointer event, so mouse, controller rays and hand rays behave the same.

| Tool (key) | What it does |
| --- | --- |
| 1 Select / move | Drag an object to move it. Yellow handle resizes, blue handle rotates. |
| 2 Draw wall | Press on the ground, drag, release. |
| 3 Building | Click the ground to drop a building. |
| 4 Set goal | Click the ground to move the goal flag. |
| 5 Place robot | Click the ground to teleport the robot. |
| 6 Platform / road | Drag out a rectangle. Asphalt makes a road with a centre line. |
| 7 Decoration | Click to place a tree, streetlight or crate (pick in the inspector). |
| B | Demo helper: slides a wall across the robot's route to force a replan. |
| Enter XR | Immersive mode — AR passthrough when available (Quest fallback chain), otherwise VR. |
| VR | Small alternate: headset-only, no passthrough. Prefer **Enter XR** on Quest. |
| P Place world | In AR: highlight Space Setup planes; click a table/floor to pin the miniature (optional anchor). |
| Voice “go home” / “go home now” | Leave the editor for the landing page (force skips unsaved confirm). |
| R / Shift+R, `[` `]`, Del | Rotate 15°, lower/raise height, delete the selected object. |
| D, M, T, G | Duplicate, cycle material/style, toggle flat/pitched roof, toggle grid snapping. |
| X, V | Toggle XR rays; toggle Real / Virtual ground. |
| ? / **Guide** | Open the user & controls guide (same content in VR from wrist or control panel). |

A selected object shows drag handles (yellow sphere resizes, blue sphere rotates) and press
buttons (green cube duplicates, purple cube cycles material/style, red cube deletes). They are
ordinary pointer targets: click them on desktop, poke them with a fingertip or grip them with a controller in XR.

### Hand grab in XR

With the **Select** tool, grab an object directly with your hand (pinch or close your fist on it)
or with a controller (squeeze the grip while touching it). Rays are off by default (toggle with X or the wrist menu).

| Gesture | What it does |
| --- | --- |
| One hand: grab and move | Slides the object across the map; it stays on the ground |
| One hand: twist your wrist | Turns the object (yaw only) |
| Second hand grabs the same object | Two-hand rotate; pull hands apart or together to scale uniformly |
| Release | The object stays where you left it; the robot replans |
| Grab the dark table edge | Moves the whole map (up, down, closer); two hands turn it. Works with any tool (tabletop scale only) |

Snapping (G) applies while you hold the object: position snaps so footprint edges land on the 0.5-unit
grid, yaw to 15°, width and depth to 0.5 and height to 0.5. A one-hand grab never resizes an object.
The grab logic lives in `src/editor/grab.ts` and uses `@react-three/handle` for the hand tracking math.

### Gestures (XR, Minority Report–style)

| Gesture | Does |
| --- | --- |
| **L** (thumb + index at a right angle), hold | Sets the world's primary axis to where your index points |
| **Two fists**, pull | Moves the world past you at true scale (walk the 80 m map from a small room) |
| **Frame** (both hands in mirrored L's), hold | Selects everything inside the frame as a group |
| **Pinch** at a distance + **roll your wrist** | Rotates the object (or the group) |

**Controllers** do the same: both grips pull the world, both triggers frame, hold A sets the axis, right
trigger + twist rotates, left stick moves you and right stick snap-turns.

Holding an object shows a snap ghost; controllers buzz on grab, snap, place and presses; objects outline
when you can grab them. Place library assets by aiming at the floor and pinching (or trigger), no rays needed.
Everything placeable is in the **asset library**, including your own `.glb` models: see [docs/asset-library.md](docs/asset-library.md).

The app asks for WebXR `unbounded` tracking so you can walk past the play-area boundary, and keeps the
ground on your real floor (a detected floor plane, or the floor-level reference space). Design notes,
tuning and limits are in [docs/gestures.md](docs/gestures.md).

### Wrist menu (XR)

Turn your **left palm toward your face** (or tilt the top of the left controller toward you) and a small
panel appears above your wrist. Poke it with your right index finger:

- **Rays on/off**: pointer rays for distant objects (same as X). Grabbing and poking keep working either way
- **Snap on/off**: same as G
- **Real / Virtual**: the surface the world stands on (same as V)
- **1:60 · 1:20 · 1:4 · 1:1**: world scale presets (below)
- **Recenter**: puts the world back in front of you at the current scale
- **Mocap**: connects the Smartsuit Pro skeleton ([docs/smartsuit.md](docs/smartsuit.md))

## Life size and world scale

Everything is modelled at **real-world size: 1 unit = 1 m**. Doors are 2.1–2.4 m (3.5 m garage doors),
storeys are 3 m with window rows at real sill height, streetlights 6 m, and houses, offices and towers
use real footprints. The map is an 80 × 80 m city block. Sizes live in `src/world/scale.ts` and the
catalog.

The same world can be shown at four scales (HUD **Scale** select or the wrist menu):

| Preset | Board size | Where it goes |
| --- | --- | --- |
| Tabletop 1:60 | ~1.3 m | On your floor just ahead of you (Place pins it to a real table); grab its edge to move it |
| Room 1:20 | ~4 m | On your floor, ahead of you |
| Large 1:4 | ~20 m | On your floor; the robot start is 1.5 m ahead, buildings are knee to chest high |
| Life size 1:1 | 80 m | On your floor at true size; stand next to the robot and walk up to a doorway |

Handles, buttons and the goal flag keep a reachable real size at every scale, and lighting and shadows
follow the world.

**Occlusion (O, the HUD, or wrist Occl.; off by default).** Hides virtual objects behind real ones: live depth on
Quest 3/3S, or your Space Setup walls and furniture on Quest 2 (see [docs/occlusion.md](docs/occlusion.md)).

**Real room (P / wrist Surf.; spatial save).** With Space Setup, objects rest on real tables and stop at
real walls, and saved worlds remember their real spot on this headset (see [docs/real-room.md](docs/real-room.md)).

**Moving the floating panels.** Grab the **Move** bar above the Control Palette or guide panel, or point a ray at
it and pull the trigger. The panel faces you when released and stays there until Recenter.

**Real vs virtual surface (V, or the wrist menu).** With **Real** (the default) the ground is a transparent
grid: passthrough shows your actual floor or table, grid lines mark the 0.5 m snap step and every 5 m, an
orange outline marks the map's edge, and a 1 m cross marks its origin. Objects still cast shadows onto your
real floor. Walk around and everything stays put at true size. **Virtual** draws the solid placeholder
ground instead. At life size the floor is out of fingertip reach, so turn on rays (X) to point at the floor
when placing objects, then grab them by hand.

In **VR/AR**, use hand grab (rays default off), the left-wrist menu, and the floating control
palette. Open **Guide** anytime for short, sectioned help.

The **inspector** (top right, desktop) sets exact dimensions, material, building style and roof,
picks what the creation tools place, toggles snapping, and loads environments
(**Forge District**, **Mars Outpost**, **Autonomous Warehouse** — see [docs/environments.md](docs/environments.md)).
Loading a preset asks before replacing a world that has objects in it.

On desktop, drag empty ground to orbit the camera.

## How it fits together

```
src/world/types.ts         shared schema + map constants (the contract)
src/world/store.ts         Zustand world store: objects, goal, robot start, editor tool/selection
src/world/serialize.ts     versioned realmforge-world JSON + validation
src/world/persistence.ts   localStorage save/load, export/import (UI-agnostic)
src/world/history.ts       undo/redo with drag coalescing (UI-agnostic)
src/nav/grid.ts            obstacle footprints -> occupancy grid (rotated rects, inflated by robot radius)
src/nav/astar.ts           8-connected grid A* + line-of-sight smoothing
src/nav/navigation.ts      replans on every geometry/goal/robot change; flags routes an edit blocked
src/agent/Robot.tsx        primitive robot that follows waypoints
src/world/catalog.ts       object defaults, building styles, material lists, style cycling
src/world/snap.ts          grid / angle snapping helpers
src/world/scale.ts         real-world constants: storey height, door sizes, facade bays
src/world/presets.ts       preset layouts (Forge / Mars / Warehouse)
src/world/environment.ts   environment config + loadEnvironment() API
src/world/actions.ts       XR-safe World Action API (see docs/xr-world-actions.md)
src/world/eventCatalog.ts  Universal event furniture / booths / wayfinding catalog
src/sim/*                  Single-attendee event simulation MVP
src/voice/*                AssemblyAI voice commands (see docs/voice-commands.md)
src/editor/*               pointer editing + XR grab, wrist menu, rays/surface (Quest)
src/xr/*                   AR enter fallback, Place city plane pinning
src/scene/worldRoot.ts     presentation scale presets (tabletop → life size); store stays metres
src/scene/structures/      how each object kind is drawn (buildings, walls, platforms, decorations, props)
src/scene/materials.ts     procedural canvas textures + shared, cached materials
src/scene/*                scene graph, lighting, world root (scale presets, placement), route + goal visuals
src/xr/*                   AR session fallback, "Place city" plane pinning and anchors
src/mocap/*                Smartsuit Pro (Rokoko) stream: parser, client, debug skeleton (+ tools/mocap-bridge.ts)
```

World save/load and undo/redo: `docs/world-persistence.md`. Quest XR testing: `docs/quest2-testing.md`.
**Scale contract:** store / nav / saves use metres; `WORLD_ROOT.scale` is presentation only.

### Shared object contract

```ts
interface WorldObject {
  id: string                  // stable, never reused
  kind: 'wall' | 'building' | 'platform' | 'tree' | 'streetlight' | 'crate'
  position: [x, y, z]         // base centre of the footprint, map units, y = 0 on the ground
  size: [width, height, depth]// full extents along local x, y, z
  rotationY: number           // yaw in radians; only yaw affects navigation
  color?: string
  // Optional, visual only (older objects without them still work):
  material?: 'concrete' | 'brick' | 'metal' | 'glass' | 'wood' | 'asphalt' | 'grass'
  style?: 'tower' | 'office' | 'house' | 'industrial'  /* buildings */ | 'round' | 'pine' /* trees */
  roof?: 'flat' | 'pitched'   // buildings
  solid?: boolean             // override whether it blocks navigation
}
```

**What blocks the robot** is decided in one place, `blocksNavigation()` in `src/world/types.ts`:
walls and buildings always block; platforms block only when taller than `STEP_HEIGHT` (0.3), so
roads and plazas are walkable; trees, streetlights and crates never block unless `solid` is set.
Navigation builds its grid from `navObstacles(objects)`; the grid and A* code are unchanged.

- **Units:** 1 map unit = 1 m. The map spans ±`WORLD.half` (40) on x and z with 0.5-unit grid cells.
- **Miniature:** everything is drawn inside one root group (`src/scene/worldRoot.ts`) with
  presentation scale presets (tabletop → life size). Store values stay map-local metres; convert a
  pointer ray with `groundPoint(event)`.
- **Edits trigger navigation** through the store: `addObject`, `updateObject` and `removeObject`
  bump `geometryVersion`, and navigation rebuilds the grid and replans. XR input only needs to call
  these actions; it never talks to navigation directly.

### What is honest to claim

The robot uses grid A* over an occupancy grid built from obstacle footprints. It is not a physics
or robotics simulation.

## Unified integration handoff

See [integration audit and merge order](docs/unified-integration.md),
[demo readiness and hardware record](docs/demo-readiness.md), and
[XR menu contract](examples/unified-xr-contract.ts).
Desktop voice supports start/stop, hold-to-talk, and a typed command fallback.
World replacements use a shared confirmation dialog; an XR menu must provide its own consumer.

## Warehouse object catalog

The inspector's **Object catalog** and the VR palette's **Assets / Routes** tabs add warehouse equipment,
placement previews and usable robot destinations. Load Autonomous Warehouse to see the seeded objects.
Choose an item, aim at clear ground and click to place; key **8** selects catalog placement and **R** rotates it.
See [warehouse catalog workflow and validation](docs/warehouse-catalog.md).

## Project landing page

The root URL introduces RealmForge XR. **Launch editor** opens `?editor=1`; environment cards
open the editor with the selected template (`?editor=1&world=warehouse`, for example).
The world editor and XR modules load only when the editor is launched.
See [landing page verification](docs/landing-page.md).

## Scan a property, plan on web, explore in XR

Build → **Property scans** assembles up to 24 named GLB mesh sections (250 MB total): rooms, garage, and outdoor areas. Align sections, calibrate scale, label floors, and show/hide or solo parts of a property. Web and immersive controls share the same transforms and actions. Export a **property bundle (.rfproperty)** to carry the actual mesh files to another device; ordinary world JSON carries alignment only. Native file controls run outside immersive mode. Navigation remains on one flat plane; scan surfaces are visual references.

### Scanning with Scaniverse

RealmForge doesn't capture scans itself. Use the free [Scaniverse](https://scaniverse.com) app (iPhone or Android):

1. Scan one room or area at a time. Move slowly and include a doorway that the next room shares.
2. Get a **mesh** as a **GLB** file (not a splat):
   - **Classic** experience: choose **Mesh** when you start, let it process, then **Share → Export Model → GLB**.
   - **New** experience: capture into a Site, generate a Mesh asset, then download its GLB from Scaniverse Web.
3. Send the `.glb` to the computer or headset running RealmForge (AirDrop, Google Drive, email, or USB).
4. In the editor: **Build → Property scans → Add scans (.glb)**. In the headset, open **Property scans → Files / names (exit XR)** first, since file picking happens in the browser. Line rooms up at the shared doorway, then use **Measure scale** with a distance you know, like a door width.

The same steps are in the scan panel and in the in-app **Guide** (Scans tab), on web and in the headset.

See [property scan workflow, transfer format, and validation](docs/property-scans.md).
