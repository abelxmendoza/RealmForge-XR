# Runtime & data state

Living record of **what state exists**, what bumps it, and what changed.
Update this when store fields, XR session modes, placement, or schemas change.

## Current product state (`/` — React app)

### World store (`src/world/store.ts`)

| Field | Meaning | Bumped / set when |
| --- | --- | --- |
| `objects` | Map of `WorldObject` by id | add / update / remove / duplicate / loadWorld / reset |
| `robotStart` | Robot spawn `[x,z]` map coords | placeRobot / loadWorld / reset |
| `goal` | Goal `[x,z]` or null | setGoal / loadWorld / reset |
| `geometryVersion` | Obstacle geometry epoch | any geometry-affecting object change |
| `robotVersion` | Teleport epoch | placeRobot |
| `tool` | Active editor tool | setTool / keyboard |
| `selectedId` | Selected object | select / duplicate |
| `dragging` | Drag in progress | setDragging |

`WorldSnapshot` = `{ objects[], robotStart, goal }` — preset/load payload. Not yet persisted to disk/localStorage.

### Editor settings (`src/editor/settings.ts`)

| Field | Meaning |
| --- | --- |
| `snap` | Map-grid / angle / footprint snap on/off (G) |

### Navigation (`src/nav/navigation.ts`)

| Field | Meaning |
| --- | --- |
| `status` | `idle` \| `moving` \| `arrived` \| `no-path` |
| `replanCount` | How many times path was recomputed |
| path / grid | Derived from world obstacles + goal |

Replans when `geometryVersion` or goal/robot placement changes (see nav module).

### Scene placement (`src/scene/worldRoot.ts`)

| Constant / ref | Meaning | Notes |
| --- | --- | --- |
| `WORLD_ROOT.position` | Miniature pose in room/desktop space | Fixed today: `(0, 0.8, -1.1)` |
| `WORLD_ROOT.scale` | Map units → meters | `0.07` (tabletop) |
| `worldRootRef` | Live `THREE.Group` | Used by `groundPoint()` for ray → map coords |

**Planned (Phase 1):** mutable placement from plane hit + optional WebXR anchor id; document fields here when added.

### XR session (main app)

| Item | Current | Planned |
| --- | --- | --- |
| Store | `createXRStore()` in `App.tsx` | unchanged shell |
| Enter AR/VR | bare `enterAR()` / `enterVR()` | feature fallback chain from xr-test |
| Plane / mesh / depth / anchors | not requested | P0.1–P0.2 |

### Env

| Var | Status |
| --- | --- |
| `KAEDIM_API_TOKEN` | In encrypted `.env`; **unused in code** |

## Current harness state (`/xr-test/` — vanilla)

Owned by Emiliano’s page; **not** wired to Zustand.

| Concern | Behavior |
| --- | --- |
| Session attempts | full+depth → no depth → minimal |
| Grab | attach to hand/controller; **scale locked** (1 unit = 1 m) |
| Snap | plane (Quest 2) / mesh (Quest 3S); ghost + hysteresis |
| Anchors | create on place; restore when available |
| HUD | features + fps canvas |

## Schema notes (`WorldObject`)

See `src/world/types.ts`. Kinds: `wall` | `building` | `platform` | `tree` | `streetlight` | `crate`.
Nav helpers: `blocksNavigation`, `navObstacles`. Breaking kind/field changes must bump a note here and add/adjust `world.test.ts`.

## State change log

### 2026-10-17

- Merged branches; **no store/schema changes**.
- Documented existing state surfaces for ongoing integration.
- Next expected STATE update: XR placement fields on `WORLD_ROOT` and session feature flags after P0.1–P0.2.
