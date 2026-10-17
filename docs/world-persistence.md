# World persistence & undo/redo

No backend: worlds live in `localStorage` or in exported JSON files. History lives in memory for the session.

## File format (version 1)

```json
{
  "format": "realmforge-world",
  "version": 1,
  "name": "My First World",
  "savedAt": "2026-10-17T19:30:00.000Z",
  "objects": [ { "id": "bld-1", "kind": "building", "position": [x, y, z], "size": [w, h, d],
                 "rotationY": 0, "color": "#d8d2c4", "style": "office", "roof": "flat", "material": "...", "solid": true } ],
  "robotStart": [x, z],
  "goal": [x, z]
}
```

- `objects` uses exactly the shared `WorldObject` schema from `src/world/types.ts`. Optional fields: `color`, `material`, `style`, `roof`, `solid` (written only when set).
- `robotStart` and `goal` are `[x, z]`. On import, `[x, y, z]` is also accepted (`y` ignored). `goal` may be `null`.
- Only world data is written: no editor state, no secrets.

### Validation (`parseWorld` in `src/world/serialize.ts`)

**Rejected:** invalid JSON; wrong `format` / `version`; `objects` not an array or >2000 entries; unknown `kind`; non-numeric / non-positive size; bad `robotStart` / `goal`.

**Repaired (with warnings):** positions/sizes clamped to map limits; invalid rotation → 0; unknown optional fields dropped; duplicate/invalid ids replaced; store id counter advanced past imported `prefix-N` ids.

## Public API — persistence (`src/world/persistence.ts`)

Plain functions (no React). Storage errors return result objects; they never throw.

| Function | What it does |
| --- | --- |
| `listSavedWorlds()` | Saved worlds, newest first: `{ id, name, savedAt, objectCount }` |
| `saveWorld(name, { overwriteId?, confirmed? })` | New entry by default. Overwrite only with `{ overwriteId, confirmed: true }` after asking the user. |
| `quickSave(name?, { confirmOverwrite? })` | Save as new, or ask then overwrite the active save. |
| `loadSavedWorld(id, { confirmReplace? })` | Replace active world (asks if non-empty). |
| `renameSavedWorld` / `deleteSavedWorld` | Library management (delete does not touch the editor world). |
| `exportWorld` / `downloadWorld` | Portable JSON + suggested filename. |
| `importWorld(fileOrJson, { confirmReplace? })` | Validate → confirm → load. |
| `replaceWorld(parsedWorld, { confirmReplace? })` | Same for in-memory worlds (presets). |
| `currentWorldFile(name?)` | Active world as a `WorldFile`. |
| `useWorldLibrary` | Zustand `{ worlds, activeId, activeName, dirty }` for UI. |
| `installDirtyTracking` / `markClean` / `refreshDirty` | Unsaved-changes fingerprint. |

**Result shapes:** `{ ok: true }` / `{ ok: true, value }` / `{ ok: true, warnings }` or `{ ok: false, error, cancelled? }`.

**Confirmation:** `confirmReplace` / `confirmOverwrite` return `boolean | Promise<boolean>`. Default is `window.confirm`. In XR, pass your own dialog.

**Navigation:** loads go through `useWorld.loadWorld()`, which bumps geometry + robot versions so navigation rebuilds the grid, teleports the robot to `robotStart`, and replans.

## Public API — undo/redo (`src/world/history.ts`)

| Function | What it does |
| --- | --- |
| `undo()` / `redo()` | Restore previous / next world snapshot. Returns `boolean`. |
| `installHistory()` | Subscribe once at boot; records create/delete/move/rotate/resize/material/style/goal/robot. |
| `getHistoryState()` / `subscribeHistory(fn)` | `{ canUndo, canRedo, undoDepth, redoDepth }` for menus. |
| `clearHistory()` / `withHistorySuppressed(fn)` | Used by load/import so they do not pollute the stacks. |

- An entire drag (`dragging` true → false) is **one** history entry.
- Undo/redo use `restoreWorld` (not `loadWorld`): geometry always replans; the live robot is only teleported when `robotStart` actually changed.
- Loads/imports call `clearHistory()`.

### For Emiliano (XR menu)

```ts
import {
  listSavedWorlds, saveWorld, loadSavedWorld, deleteSavedWorld, importWorld, useWorldLibrary,
} from '../world/persistence'
import { undo, redo, subscribeHistory } from '../world/history'

listSavedWorlds()
saveWorld('Table city') // always a new entry
await loadSavedWorld(id, { confirmReplace: (msg) => showXRConfirm(msg) })
await quickSave(undefined, { confirmOverwrite: (msg) => showXRConfirm(msg) })
undo(); redo()
subscribeHistory((s) => setMenuEnabled({ undo: s.canUndo, redo: s.canRedo }))
```

Prefer saved worlds in the headset; use export/import on desktop (no file picker in XR).

### For Chris (desktop UI)

`src/editor/WorldsPanel.tsx` is a minimal panel inside the inspector (save / update / export / import / list / undo / redo). It only calls the APIs above — restyle or replace freely. CSS lives under `.inspector ul.worlds` and `.dirty-dot` in `src/style.css`.

## Desktop shortcuts

| Input | Action |
| --- | --- |
| Ctrl/Cmd+S | `quickSave()` (confirms before overwrite) |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| Drop `.json` on the page / Worlds panel | `importWorld(file)` |

## Tests

- `src/world/persistence.test.ts` — serialize/validate, localStorage, no-overwrite without confirm, import/export, nav rebuild after load
- `src/world/history.test.ts` — add/undo/redo, drag coalesce, geometry undo without robot teleport, material changes

## Known limitations

- ~5 MB `localStorage` per origin; Forge District is ~15 KB.
- Saves are per-browser; use export/import to move worlds.
- App does not auto-load the last world on boot (starts with the default starter).
- Undo covers world data only (not tool selection or camera).
