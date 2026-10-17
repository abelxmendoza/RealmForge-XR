# Multi-environment worldbuilding

Hackathon environments for RealmForge XR. Layouts stay in `src/world/presets.ts`;
appearance and brush defaults live in `src/world/environment.ts`.

## Environments

| ID | Name | Notes |
| --- | --- | --- |
| `forge-district` | Forge District | Existing demo city (preserved) |
| `mars-outpost` | Mars Outpost | Red ground, habitats, solar arrays, comm tower |
| `warehouse` | Autonomous Warehouse | Racks, aisles, loading dock, cargo |
| `empty-event-venue` | Empty | No objects, actors, robot or destination |
| `job-fair` | Job Fair | Registration, employer stations, seating and stage |

Each config defines: id, display name, description, ground/table/grid colors, lighting,
default building/wall/platform brush styles, and a `buildWorld()` snapshot
(objects + robot start + goal).

## UI menu

Desktop has one **Worlds library (L)** for templates, saved worlds, saving, import and export. The right-click shortcut opens this same library. The duplicate HUD/inspector environment lists and separate saves panel are no longer mounted.

In XR, the floating control palette **Worlds** tab is the single world picker. It uses the same template list as desktop, including exactly one Empty choice and one Job Fair choice. The wrist menu retains settings but no environment picker.

Empty has no authored content and remains empty through save/load. Job Fair has its own furnished layout. Existing version-1 saves without a robot-enabled flag retain their original robot.

### Error handling

- Unknown / empty ids → `{ ok: false, error }` (no store mutation)
- Missing `confirmReplace` on a non-empty world → cancelled, world unchanged
- `confirmReplace` throwing → non-cancelled failure message (world unchanged)
- `buildWorld()` throwing / invalid snapshot → failure, `activeId` stays previous
- Menu overlaps → busy guard returns an error toast; buttons disable while loading
- Confirmation channel with no UI consumer → deny (never `window.confirm`)

Tests: `environmentErrors.test.ts`, `environmentMenuController.test.ts`, `confirmation.test.ts`, `errors.test.ts`.

## Public API (for Emiliano / XR menu)

```ts
import {
  loadEnvironment,
  listEnvironments,
  getEnvironment,
  useEnvironment,
  type EnvironmentId,
} from '../world/environment'

listEnvironments()
// [{ id: 'forge-district', name: 'Forge District', description: '…' }, …]

// Empty sandbox — no confirm needed
await loadEnvironment('mars-outpost')

// Non-empty world — YOU must supply confirmReplace (core never calls window.confirm)
await loadEnvironment('warehouse', {
  confirmReplace: (msg) => showXRConfirm(msg), // Promise<boolean> | boolean
})

useEnvironment.getState().activeId        // 'mars-outpost' | null
useEnvironment((s) => s.appearance)       // reactive ground/lighting for scene
```

### Confirmation contract

- If the current world has **0** objects → load proceeds.
- If it has objects and `confirmReplace` is **omitted** → `{ ok: false, cancelled: true }` (safe no-op).
- If `confirmReplace` returns **false** → world and appearance unchanged.
- Desktop Inspector / Environments menu pass `confirmReplace` from `src/world/confirmation.ts` (HTML dialog). XR uses the control palette Confirm/Cancel tiles.

Does **not** touch hand tracking, controllers, Place city, or XR session code.

## Files

| File | Role |
| --- | --- |
| `src/world/environment.ts` | Config registry, `loadEnvironment`, `useEnvironment` |
| `src/world/presets.ts` | `forgeDistrict`, `marsOutpost`, `warehouse` builders |
| `src/scene/Lighting.tsx` / `Scene.tsx` / `editor/Ground.tsx` | Read appearance |
| `src/world/environment.test.ts` | Preset nav + switch + persistence tests |

## Compatibility with open PRs

| PR | Concern |
| --- | --- |
| **#3 persistence** | This branch is based on it. Env loads go through `replaceWorld` after confirm; saves/export keep working (objects-only JSON — env id not stored yet). |
| **#2 Quest XR** | Overlaps `Scene.tsx` / `App.tsx` / `README.md`. Env only adds background from `useEnvironment` in `Scene`; Place city wraps `WORLD_ROOT` — merge must keep **both** `WorldPlacement` and env background. |

## Known limitations

- Procedural primitives only (existing kinds: building, wall, platform, crate, tree, lamp).
- No heightmaps, dust, or new robot dynamics.
- Environment id is not written into exported world JSON yet.
- Starter sandbox has `activeId: null` and default tabletop colors until a load.

## Warehouse interior

The Warehouse environment renders a fixed industrial shell: concrete floor with expansion joints, yellow aisle markings, corrugated wall panels, roller loading doors and bollards, steel portal frames, high-bay fixture strips and a ceiling with skylight strips. Exterior views cut away the near walls and roof so tabletop editing stays accessible. The ceiling returns when the camera is inside the building footprint below its 12 m roof. The shell is presentation geometry outside the editable map, ignores pointer rays and does not add navigation obstacles. It follows the environment identity restored with saved worlds.

Fresh Warehouse templates replace exterior building placeholders with sixteen pallet shelving bays, remove streetlights and asphalt roads, and preserve the central/cross aisles and five destination markers. Racks remain editable catalog objects with saved footprints and navigation collisions. Existing saves retain their authored object layouts; reload the Warehouse template for the new shelving layout.

Validation: 221 tests passed across 30 files, including all preset destination routes and full catalog save/import equality. TypeScript and production build passed. Browser preview confirmed the warehouse cutaway, shelving, floor markings and doors; dispatching the robot to the inspection marker reported moving with a new replan. Physical headset and inside-camera views still need device validation.
