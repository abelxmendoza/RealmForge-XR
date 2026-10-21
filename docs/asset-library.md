# Asset library

Everything you can place lives in one registry (`src/world/assetLibrary.ts`), so the desktop **Asset
library** panel, the in-VR **Control Palette → Assets** page and the **8 / Assets** tool all work the same
for every asset: ghost preview (green = clear, red = overlaps something solid), ±90° rotation, snapping,
grab / move / rotate / scale, undo, save and load.

| Category | Assets |
| --- | --- |
| Warehouse | Pallets (empty, boxes, wrapped); rack runs (1 bay, 3 bays, 3 bays empty) |
| Equipment | Storage rack, workstation, conveyor, cargo container, safety barrier, loading bay (main's catalog) |
| Destinations | Pickup, delivery, charging, inspection zones (the robot can be sent to them) |
| Structures | Glass tower, office block, house, industrial |
| Decor | Trees, streetlight, crate |
| Custom | Your own 3D models, from the manifest below |

All sizes are real metres (1 unit = 1 m), so assets are true size at the 1:1 scale.

## Adding your own 3D models

1. Export a **.glb** (binary glTF) from Blender or similar:
   - **Y up**, in metres
   - Apply transforms first
   - Keep it light for Quest: well under 50k triangles, small textures
2. Put it in `public/assets/models/`, for example `public/assets/models/forklift.glb`.
3. Add an entry to `public/assets/library.json`:

   ```json
   {
     "version": 1,
     "assets": [
       { "id": "forklift", "name": "Forklift", "model": "models/forklift.glb", "size": [1.2, 2.2, 2.4] }
     ]
   }
   ```

4. Reload the editor. The asset appears under **Custom**, on desktop and in the headset.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lowercase letters, digits, dashes. Saved in world files, so don't rename it later |
| `name` | yes | Shown in the pickers (≤ 60 characters) |
| `model` | yes | `.glb` / `.gltf`, relative to the manifest (or an `https://` URL) |
| `size` | yes | `[width, height, depth]` in metres: the asset's footprint and height |
| `fit` | no | `"contain"` (default) keeps proportions inside `size`; `"stretch"` fills it exactly |
| `solid` | no | Blocks the robot (default `true`) |
| `color` | no | Placeholder colour while loading or if the model is missing |
| `description` | no | Tooltip text |

**How it behaves:**
- **Fitting:** the model is scaled to `size` and placed with its base on the ground at the object's origin.
- **Navigation:** it uses the `size` footprint, not the model's exact shape.
- **Missing or broken models:** show a translucent placeholder box of the same size, and the world still
  works. Bad manifest entries are skipped with a warning in the console (and the dev log).
- **Saved worlds** store the asset `id`. If an id is no longer in the manifest, the object still loads as
  a plain crate of the same size.

## Generated and imported models

The Creative Studio (`?studio=1`, see `docs/creative-studio/README.md`) keeps a separate, gitignored library of
artwork-to-3D assets with versioned manifests. Its converted GLBs pass a validation gate and can be copied into
`public/assets/models/` + `library.json` to place them in worlds.

## Code map

```
src/world/assetLibrary.ts           registry: built-in assets, categories, registerAssets(), useAssetLibrary
src/world/assetManifest.ts          parseAssetManifest() validation, loadAssetManifest() at editor start
src/world/assets.ts                 buildAsset / canPlaceAsset (placement, overlap)
src/world/assetActions.ts           select / rotate / preview / place, robot destinations
src/scene/structures/ModelStructure.tsx  .glb rendering, fit, placeholder and error fallback
public/assets/library.json          your custom assets (empty by default)
```
