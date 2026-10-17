# Multi-environment worldbuilding

Hackathon environments for RealmForge XR. Layouts stay in `src/world/presets.ts`;
appearance and brush defaults live in `src/world/environment.ts`.

## Environments

| ID | Name | Notes |
| --- | --- | --- |
| `forge-district` | Forge District | Existing demo city (preserved) |
| `mars-outpost` | Mars Outpost | Red ground, habitats, solar arrays, comm tower |
| `warehouse` | Autonomous Warehouse | Racks, aisles, loading dock, cargo |

Each config defines: id, display name, description, ground/table/grid colors, lighting,
default building/wall/platform brush styles, and a `buildWorld()` snapshot
(objects + robot start + goal).

## UI menu

Desktop uses the molten-forge HUD/inspector styling (`EnvironmentsMenu`):
full list with descriptions in the inspector, plus a compact **Env** chip row in the HUD.
Both call `loadEnvironmentFromMenu` → `worldActions.loadEnvironment(id, { confirmReplace })`.

In XR, the control palette **Worlds** tab and wrist env buttons use the same API.

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
- Desktop Inspector passes `(msg) => window.confirm(msg)` at the **UI layer only**.

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
