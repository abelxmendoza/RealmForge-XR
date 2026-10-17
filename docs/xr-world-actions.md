# XR World Action API

Shared integration layer between Abel’s worldbuilding engine and Emiliano’s Quest XR UI.
**Branch:** `cursor/xr-world-actions-96f4`

Module: [`src/world/actions.ts`](../src/world/actions.ts)

## Design rules

| Rule | Detail |
| --- | --- |
| One state | Wraps `useWorld`, `useWorldLibrary`, `useEnvironment`, history — **no second Zustand store** |
| XR-safe confirms | Destructive loads never call `window.confirm` in this API |
| No input ownership | Hand tracking, rays, Place city stay in Emiliano’s XR modules |
| Stable surface | Prefer `worldActions.*` or named exports from `actions.ts` |

## Quick start (XR menu)

```ts
import { worldActions } from '../world/actions'

// Wire a confirm panel once (returns Promise<boolean>)
const confirm = (msg: string) => showXRConfirm(msg)

// Tools
worldActions.setTool('wall')
worldActions.setTool('select')

// Environments (IDs from Abel’s engine)
worldActions.listEnvironments()
await worldActions.loadEnvironment('mars-outpost', { confirmReplace: confirm })
await worldActions.loadEnvironment('warehouse', { confirmReplace: confirm })
await worldActions.loadEnvironment('forge-district', { confirmReplace: confirm })

// Robot
worldActions.placeRobot([x, z])
worldActions.setGoal([x, z])

// Objects (after a ray hit / grab release)
const id = worldActions.createObject({
  kind: 'building',
  position: [x, 0, z],
  size: [2, 2, 2],
  rotationY: 0,
  style: 'industrial',
})
worldActions.updateObject(id, { position: [x2, 0, z2], rotationY: yaw })
worldActions.deleteObject(id)
worldActions.selectObject(id)

// Undo / redo (map to menu buttons or gestures)
worldActions.undo()
worldActions.redo()

// Saves (browser localStorage — no file picker in headset)
worldActions.listSavedWorlds()
worldActions.saveWorld('Table city')
await worldActions.loadSavedWorld(id, { confirmReplace: confirm })
```

## Confirmation contract

```ts
type ConfirmReplace = (message: string) => boolean | Promise<boolean>
```

| Situation | Behavior |
| --- | --- |
| World empty | Load proceeds without calling confirm |
| Non-empty, `confirmReplace` omitted | `{ ok: false, cancelled: true }` — no-op |
| Non-empty, confirm returns false | No-op |
| Non-empty, confirm returns true | Replace proceeds |

Desktop may pass `(msg) => window.confirm(msg)` at the **UI** layer. XR must pass an in-headset dialog.

## What this API does **not** own

| Concern | Owner / location |
| --- | --- |
| Enter AR / session fallback | PR #2 `src/xr/session.ts` |
| Place city / plane pin / anchors | PR #2 `src/xr/placement.ts`, `WorldPlacement.tsx` |
| Hand grab / ray mesh picking | Emiliano XR interaction code |
| Worlds panel DOM / Inspector | Chris desktop UI |

### Place city (contract for PR #2 merge)

After #2 lands, menu “Place city” continues to call placement APIs from `src/xr/placement.ts`
(`startChoosing`, `resetToDefault`). That is **room pose**, not world schema — keep it next to
WebXR, not inside `worldActions`. Optionally later:

```ts
// Emiliano-only glue (do not put WebXR types in world/actions.ts)
import { usePlacement } from '../xr/placement'
usePlacement.getState().startChoosing()
```

## Required changes from Emiliano

1. Import `worldActions` (or named exports) from `../world/actions` in the XR menu.
2. Implement `showXRConfirm(message): Promise<boolean>` and pass it as `confirmReplace`.
3. Replace any direct `window.confirm` / desktop-only calls for load/env/save-load with this API.
4. Keep using PR #2 placement/session modules for AR enter and table pin — do not fork them into `world/`.
5. Prefer map-local `[x, z]` from existing `groundPoint()` when creating/moving objects on the miniature.
6. Do not create a parallel world store.

## Example file

See [`examples/xr-menu-integration.ts`](../examples/xr-menu-integration.ts) for a copy-paste menu sketch.

## Tests

`src/world/actions.test.ts` covers tools, objects, env load + confirm gate, undo/redo, save/load, and store identity.
