# Multi-environment worldbuilding

Hackathon environments for RealmForge XR. Layouts stay in `src/world/presets.ts`;
appearance and brush defaults live in `src/world/environment.ts`.

## Environments

| ID | Name | Notes |
| --- | --- | --- |
| `forge-district` | Forge District | Existing demo city (preserved) |
| `mars-outpost` | Mars Outpost | Red ground, habitats, solar arrays, comm tower |
| `warehouse` | Autonomous Warehouse | Racks, aisles, loading dock, cargo |

Each config defines: id, display name, ground/table/grid colors, lighting, default
building/wall/platform brush styles, and a `buildWorld()` snapshot (objects + robot + goal).

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

await loadEnvironment('mars-outpost')
await loadEnvironment('warehouse', {
  confirmReplace: (msg) => showXRConfirm(msg), // required in headset — no window.confirm
})

useEnvironment.getState().activeId        // 'mars-outpost' | null
useEnvironment((s) => s.appearance)       // reactive ground/lighting for scene
```

- **Never silent:** if the current world has objects, `loadEnvironment` asks via
  `confirmReplace` (default `window.confirm` on desktop). Cancel leaves the world and
  appearance untouched.
- **Does not touch** hand tracking, controllers, or Place city / XR session code.
- Desktop inspector **World** buttons call the same `loadEnvironment(id)`.

## Files

| File | Role |
| --- | --- |
| `src/world/environment.ts` | Config registry, `loadEnvironment`, `useEnvironment` |
| `src/world/presets.ts` | `forgeDistrict`, `marsOutpost`, `warehouse` builders |
| `src/scene/Lighting.tsx` / `Scene.tsx` / `editor/Ground.tsx` | Read appearance |
| `src/world/environment.test.ts` | Preset nav + switch tests |

## Known limitations

- Procedural primitives only (existing kinds: building, wall, platform, crate, tree, lamp).
- No heightmaps, dust, or new robot dynamics.
- Environment id is not written into exported world JSON yet (world file is still objects-only).
- Starter sandbox (app boot) has `activeId: null` and default Earth-like tabletop colors until a load.
