# World persistence: save, load, export, import

Branch: `feat/world-persistence`. No backend: worlds live in `localStorage` or in exported JSON files.

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

- `objects` uses exactly the shared `WorldObject` schema from `src/world/types.ts`. The optional fields are `color`, `material`, `style`, `roof` and `solid`, and they are written only when they are set.
- `robotStart` and `goal` are `[x, z]`, the same as the store. On import, `[x, y, z]` is also accepted and `y` is ignored. `goal` can be `null`.
- Only world data is written: no editor state and no environment variables or secrets.

### Validation when loading or importing (`parseWorld` in `src/world/serialize.ts`)

**Rejected outright:**
- not valid JSON
- the wrong `format`, or a `version` other than 1
- `objects` is not an array, or has more than 2000 entries
- an unknown `kind`
- a `position` or `size` that isn't three numbers, or a size of 0 or less
- a `robotStart` or `goal` that isn't a valid point

**Repaired, each with a warning:**
- positions are clamped to the map (±10) and sizes to their allowed range (0.01 to 40 wide, up to 60 tall)
- a rotation that isn't a valid number is reset to 0
- an unknown `material`, `style`, `roof`, `color` or `solid` value is dropped

**IDs:**
- valid IDs (letters, digits, `-` and `_`, up to 64 characters) are kept
- duplicate or invalid IDs get a fresh ID
- the store's ID counter is moved past any imported `prefix-N` IDs, so objects created later never collide with them

## Public API: `src/world/persistence.ts`

These are plain functions with no React. Each one returns a result object and never throws on storage errors.

| Function | What it does |
| --- | --- |
| `listSavedWorlds(): SavedWorldMeta[]` | Saved worlds, newest first: `{ id, name, savedAt, objectCount }` |
| `saveWorld(name, { overwriteId? })` | Saves the active world as a **new** entry. It overwrites only when you pass `overwriteId`. |
| `loadSavedWorld(id, { confirmReplace? })` | Replaces the active world. Asks first if the current world has objects. |
| `renameSavedWorld(id, name)` | Renames a saved world. |
| `deleteSavedWorld(id)` | Removes a saved world. The world open in the editor is not touched. |
| `exportWorld(name?)` | Returns `{ json, filename }`. |
| `downloadWorld(name?)` | Exports and starts a browser download. |
| `importWorld(fileOrJsonString, { confirmReplace? })` | Validates, asks, then loads. |
| `replaceWorld(parsedWorld, { confirmReplace? })` | Same as above for a world already in memory, such as a preset. |
| `currentWorldFile(name?)` | The active world as a `WorldFile`. |
| `useWorldLibrary` | Zustand store `{ worlds, activeId, activeName }` that UI can subscribe to. |

- **Result shapes:**
  - `{ ok: true }` or `{ ok: false, error }`
  - saving returns `{ ok: true, value: meta }`
  - load and import return `{ ok: true, warnings }`, or `{ ok: false, error, cancelled? }`
- **`confirmReplace(message)`:** returns `boolean | Promise<boolean>`. By default it uses `window.confirm`. In XR, pass your own dialog.
- **Navigation:** loading goes through `useWorld.getState().loadWorld()`. That updates the geometry and robot versions, so navigation rebuilds the grid, puts the robot at `robotStart` and plans a new route. Later edits trigger replanning as usual.

### For Emiliano (XR menu)

```ts
import { listSavedWorlds, saveWorld, loadSavedWorld, deleteSavedWorld, importWorld, useWorldLibrary } from '../world/persistence'

const worlds = useWorldLibrary((s) => s.worlds)          // reactive list; call listSavedWorlds() once on open
saveWorld('Table city')                                  // new entry, never overwrites
await loadSavedWorld(id, { confirmReplace: (msg) => showXRConfirm(msg) })  // your 3D yes/no panel
```

There's no file picker in the headset. Use saved worlds there, and do export and import on desktop.

### For Chris (desktop UI)

`src/editor/WorldsPanel.tsx` is a minimal working panel inside the inspector: a name box, save as new, update save, export, import, and a list with load, rename and delete. It only calls the functions above, so you can restyle it or replace it with your own UI. Its CSS is at the end of `src/style.css` under `.inspector ul.worlds`.

## Tests

`src/world/persistence.test.ts` covers:
- serialization and round trips, including Forge District
- preserving styles, roofs, materials and the `solid` flag
- rejecting malformed files and repairing out-of-range values
- duplicate and invalid IDs
- the browser storage features, including the no-overwrite rule, a cancelled confirmation, a full or missing storage, and a damaged save
- export and import, including from a File/Blob
- ID collisions after import
- navigation rebuild and replanning after a load, and replanning after an edit to the imported world

## Known limitations

- `localStorage` gives about 5 MB per site. Forge District takes about 15 KB, so that's room for hundreds of worlds. A full storage shows an error suggesting export.
- Saved worlds belong to one browser on one device. Use export and import to move them.
- The app doesn't remember which world was open after a reload. On purpose, it starts with the default world and never loads a save by itself.
- There's no unsaved-changes indicator yet. "Update save" overwrites only after a confirmation.
