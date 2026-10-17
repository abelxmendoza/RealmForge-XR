# RealmForge XR

Shape a miniature world with your hands, drop in a robot, and watch it re-route when you move a wall.
MOLTEN Hackathon, Worldbuild track. Runs in the Meta Quest browser (WebXR) and on desktop.

## Run

```bash
npm install
npm run dev        # https://localhost:5173 (and your LAN IP, for the Quest)
npm test           # grid, A*, world, grab, scale and mocap unit tests
npm run build
npm run mocap:mock # optional: synthetic Smartsuit skeleton (see docs/smartsuit.md)
```

On the Quest 3S, open `https://<laptop-LAN-IP>:5173` in the Quest Browser, accept the self-signed
certificate, then press **Enter AR** (passthrough) or **Enter VR**.

### Testing on a Quest 2

The same URL runs on a Quest 2 (grayscale passthrough, no room mesh or depth occlusion). Open
`/xr-test/` for a standalone passthrough check of true-scale grabbing, snapping to real surfaces and
anchors. Setup over USB (`adb reverse`), the Quest 2 vs 3S feature table and a test checklist are in
[docs/quest2-testing.md](docs/quest2-testing.md).

## Environment variables

Shared secrets live in `.env`, committed **encrypted** with [dotenvx](https://dotenvx.com).
`npm run dev` decrypts it automatically, as long as you have the private key.

- One-time setup: get `DOTENV_PRIVATE_KEY` from Abel (sent privately, never in git) and put it in a
  file named `.env.keys` in the repo root (`DOTENV_PRIVATE_KEY="..."`), or export it in your shell.
- Add or change a variable: `npm run env:set -- NAME value`, then commit `.env`. Teammates get it on pull.
- `.env.keys` and `*.local` are gitignored. Never commit the private key.

## Controls

Every control is a pointer event, so the mouse and XR hands and controllers behave the same.
In XR there are no rays: you reach out and touch things (see [Hand grab in XR](#hand-grab-in-xr)).

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
| R / Shift+R, `[` `]`, Del | Rotate 15°, lower/raise height, delete the selected object. |
| D, M, T, G | Duplicate, cycle material/style, toggle flat/pitched roof, toggle grid snapping. |
| X | Toggle XR pointer rays (off by default: you grab and poke things directly). |
| V | Toggle the surface: **Real** (transparent grid over your actual floor or table) or **Virtual** (solid placeholder ground). |

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

The app asks for WebXR `unbounded` tracking so you can walk past the play-area boundary. Design notes,
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
| Tabletop 1:60 | ~1.3 m | On a table at 0.8 m, just ahead of you; the table edge is grabbable |
| Room 1:20 | ~4 m | On your floor, ahead of you |
| Large 1:4 | ~20 m | On your floor; the robot start is 1.5 m ahead, buildings are knee to chest high |
| Life size 1:1 | 80 m | On your floor at true size; stand next to the robot and walk up to a doorway |

Handles, buttons and the goal flag keep a reachable real size at every scale, and lighting and shadows
follow the world.

**Real vs virtual surface (V, or the wrist menu).** With **Real** (the default) the ground is a transparent
grid: passthrough shows your actual floor or table, grid lines mark the 0.5 m snap step and every 5 m, an
orange outline marks the map's edge, and a 1 m cross marks its origin. Objects still cast shadows onto your
real floor. Walk around and everything stays put at true size. **Virtual** draws the solid placeholder
ground instead. At life size the floor is out of fingertip reach, so turn on rays (X) to point at the floor
when placing objects, then grab them by hand.

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
src/voice/*                AssemblyAI voice commands (see docs/voice-commands.md)
src/editor/*               pointer-driven editing (create, move, resize, rotate, duplicate), hand grab, wrist menu, inspector
src/scene/structures/      how each object kind is drawn (buildings, walls, platforms, decorations)
src/scene/materials.ts     procedural canvas textures + shared, cached materials
src/scene/*                scene graph, lighting, world root (scale presets, placement), route + goal visuals
src/xr/*                   AR session fallback, "Place city" plane pinning and anchors
src/mocap/*                Smartsuit Pro (Rokoko) stream: parser, client, debug skeleton (+ tools/mocap-bridge.ts)
```

World save/load and undo/redo for XR and desktop: see `docs/world-persistence.md`.

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

- **Units:** 1 map unit = 1 m, at true size. The map spans −40…40 on x and z with 0.5 m grid cells.
- **World scale:** everything is drawn inside one root group (`src/scene/worldRoot.ts`) scaled by the
  current preset (1:60 to 1:1) and placed on a table or your floor. Store values are always map-local; convert a pointer ray with
  `groundPoint(event)`.
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
