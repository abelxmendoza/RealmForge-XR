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
certificate, then press **Enter AR** (passthrough) or **Enter VR**.

## Controls

Every control is a pointer event, so mouse, controller rays and hand rays behave the same.

| Tool (key) | What it does |
| --- | --- |
| 1 Select / move | Drag an object to move it. Yellow handle resizes, blue handle rotates. |
| 2 Draw wall | Press on the ground, drag, release. |
| 3 Building | Click the ground to drop a building. |
| 4 Set goal | Click the ground to move the goal flag. |
| 5 Place robot | Click the ground to teleport the robot. |
| B | Demo helper: slides a wall across the robot's route to force a replan. |
| R / Shift+R, `[` `]`, Del | Rotate 15°, lower/raise height, delete the selected object. |

On desktop, drag empty ground to orbit the camera.

## How it fits together

```
src/world/types.ts     shared schema + map constants (the contract)
src/world/store.ts     Zustand world store: objects, goal, robot start, editor tool/selection
src/nav/grid.ts        obstacle footprints -> occupancy grid (rotated rects, inflated by robot radius)
src/nav/astar.ts       8-connected grid A* + line-of-sight smoothing
src/nav/navigation.ts  replans on every geometry/goal/robot change; flags routes an edit blocked
src/agent/Robot.tsx    primitive robot that follows waypoints
src/editor/*           pointer-driven editing (create, move, resize, rotate) + demo helper
src/scene/*            scene graph, tabletop root transform, route + goal visuals
```

### Shared object contract

```ts
interface WorldObject {
  id: string                  // stable, never reused
  kind: 'wall' | 'building'
  position: [x, y, z]         // base centre of the footprint, map units, y = 0 on the ground
  size: [width, height, depth]// full extents along local x, y, z
  rotationY: number           // yaw in radians; only yaw affects navigation
}
```

- **Units:** 1 map unit = 1 m at map scale. The map spans −10…10 on x and z with 0.5-unit grid cells.
- **Miniature:** everything is drawn inside one root group (`src/scene/worldRoot.ts`) that is scaled
  to 0.07 and placed at table height. Store values are always map-local; convert a pointer ray with
  `groundPoint(event)`.
- **Edits trigger navigation** through the store: `addObject`, `updateObject` and `removeObject`
  bump `geometryVersion`, and navigation rebuilds the grid and replans. XR input only needs to call
  these actions; it never talks to navigation directly.

### What is honest to claim

The robot uses grid A* over an occupancy grid built from obstacle footprints. It is not a physics
or robotics simulation.
