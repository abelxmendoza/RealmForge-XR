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

`WorldSnapshot` = `{ objects[], robotStart, goal }` — preset/load payload. Persisted via `src/world/persistence.ts` (localStorage library + JSON export/import).

### Editor settings (`src/editor/settings.ts`)

| Field | Meaning |
| --- | --- |
| `snap` | Map-grid / angle / footprint snap on/off (G) |
| `worldScale` | Presentation scale preset id (tabletop → life) |
| `rays` | XR pointer rays on/off (default off) |
| `surface` | `real` transparent grid vs `virtual` solid ground |
| brush fields | buildingStyle, roof, wall/platform materials, decor, treeStyle, assetId, actors |

### Navigation (`src/nav/navigation.ts`)

| Field | Meaning |
| --- | --- |
| `status` | `idle` \| `moving` \| `arrived` \| `no-path` |
| `replanCount` | How many times path was recomputed |
| path / grid | Derived from world obstacles + goal |

Replans when `geometryVersion` or goal/robot placement changes (see nav module).

### Scene placement (`src/scene/worldRoot.ts` + `src/xr/placement.ts`)

| Constant / field | Meaning | Notes |
| --- | --- | --- |
| `WORLD_ROOT.position` | Default miniature pose | `(0, 0.8, -1.1)` when unpinned |
| `WORLD_ROOT.scale` | Presentation scale | From `SCALE_PRESETS[worldScale]`; Place city does not change store metres |
| `worldRootRef` | Live map `THREE.Group` | Used by `groundPoint()` for ray → map coords |
| `usePlacement.status` | `free` \| `choosing` \| `pinned` | HUD Place city / Cancel place |
| `usePlacement.position` / `quaternion` | Room-space pose when not following an anchor | Set on pin |
| `usePlacement.anchor` | `XRAnchor` while pinned | Parent via `<XRSpace space={anchor.anchorSpace}>`; cleared on session end |
| `usePlacement.surfaceLabel` | e.g. `table`, `floor` | From `XRPlane.semanticLabel` |

### XR session (main app)

| Item | Current |
| --- | --- |
| Store | `createXRStore({ offerSession: false, planeDetection, anchors, meshDetection, hitTest, handTracking, depthSensing: false })` |
| Enter AR | `enterARWithFallback()` — `AR_ATTEMPTS` then `WebXRManager.setSession` |
| Enter VR | `xrStore.enterVR()` |
| Meta | `useXRSessionMeta`: `attempt`, `features`, `blend`, `lastError`, `entering` |

### Guide (`src/guide/guideStore.ts`)

| Field | Meaning |
| --- | --- |
| `open` / `section` | Shared desktop dialog + XR guide panel |

### Env

| Var | Status |
| --- | --- |
| `KAEDIM_API_TOKEN` | In encrypted `.env`; read server-side only by the Creative Studio (`tools/creative/projectsim.ts`, also `PROJECTSIM_TOKEN` or `~/.config/projectsim/token`) |
| `CREATIVE_ALLOW_SPEND` | Unset by default. `1` lets the dev server submit an **approved** ProjectSim generation (4 credits). Set it by hand only when you intend to spend |
| `CREATIVE_LIBRARY_DIR` / `CREATIVE_EXTERNAL_LEDGERS` | Studio library location (default `creative-library/`, gitignored) / extra read-only ledgers (default: the PX4 ledger if present) |
| AssemblyAI key | Encrypted `.env`; needs `.env.keys` / `DOTENV_PRIVATE_KEY` for live mic |

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

## Accounts (`src/auth/store.ts`)

| Field | Meaning |
| --- | --- |
| `status` | `disabled` (no Supabase config: guest mode) \| `loading` \| `signed-out` \| `signed-in` |
| `user` / `profile` | Supabase auth user / `public.profiles` row |
| `roles` | `admin` (one account) \| `founder` \| `developer` \| `member`, from `public.user_roles` (RLS) |

Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public). Routes: `?admin=1` (team & roles). See `docs/auth.md`.

## Creative Studio (`?studio=1`)

Not part of the world store. File-backed, dev server only: `creative-library/assets/<id>/manifest.json`
(schema `realmforge-creative-asset` v1, `revision` bumps per write, history kept) + `creative-library/ledger.jsonl`.
Generation status: `validated | rejected → approved → submitted → complete | failed`. See `docs/creative-studio/`.

## State change log

### 2026-10-21 (Accounts)

- Supabase project `realmforge-xr`; tables `profiles`, `user_roles`, `role_audit`; single-admin index; admin-only `grant_role` / `revoke_role`.
- New `useAuth` store (not part of the world schema); Creative Studio now needs the Developer (or Admin) role when sign-in is configured.

### 2026-10-21 (Creative Studio)

- New `?studio=1` entry; `/api/creative/*` dev middleware (loopback + localhost Host only).
- New manifest schema `realmforge-creative-asset` v1; spend ledger shares the PX4 `projectsim_ledger.jsonl` event format.
- `KAEDIM_API_TOKEN` now used server-side by the studio (plan.md P2.2: integrated).

### 2026-10-17 (cleanup)

- Persistence, environments, Quest XR, control palette confirms, forge theme, controls guide on `main`.
- Editor settings expanded (scale, rays, surface, assets, actors). `WORLD.half` = 40.

### 2026-10-17 (Phase 1 P0)

- Added `useXRSessionMeta` and `usePlacement` Zustand stores (not part of world schema).
- Runtime pose from placement (or anchor space).
