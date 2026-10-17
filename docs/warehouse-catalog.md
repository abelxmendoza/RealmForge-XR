# Warehouse catalog and functional destinations

Implemented on `codex/warehouse-catalog` in `/tmp/realmforge-warehouse`, isolated from the active world-library checkout. No changes to the other checkout's pending work are part of this feature.

## What is included

Ten procedural catalog assets: storage rack, workstation, conveyor, cargo container, safety barrier, loading bay, pickup zone, delivery zone, charging pad and inspection point. They use existing object kinds and the original world store, with optional `assetId` and `destinationRole` metadata. No external model download, new dependency, second world store, or navigation rewrite.

The Autonomous Warehouse preset contains one of each catalog item alongside the existing facility, preserving the main aisle and robot route. Forge and Mars remain unchanged; catalog items can be placed in any environment. Catalog equipment uses solid rectangular footprints; destination pads and the loading bay are walkable. Visible shelves are not individually traversable: the rack's whole footprint blocks the robot.

## Desktop workflow

1. Load Autonomous Warehouse and confirm replacement.
2. Find **Object catalog** in the inspector. Choose Equipment or Destinations, then an item. Key **8** returns to catalog placement.
3. Aim at the ground. The ghost shows the saved footprint, height and orientation. Green permits placement; red means it overlaps a solid obstacle. Click to place. R / Shift+R or the rotation buttons rotate the placement by 90°. Existing snapping applies; rotated footprints remain within the map bounds.
4. Switch to Select/move to drag an item, use handles or edit its exact dimensions and rotation in the inspector. Catalog objects expose Color rather than unrelated building styles/roof controls. M or the style button cycles their color. Existing duplicate, delete, undo/redo work.
5. Under **Robot destinations**, choose **Go** for a marker. The existing navigation plans to that marker's current world-local center. An obstructed or unreachable marker reports an error rather than changing the goal. Moving the marker afterward does not silently retarget the robot; press Go again to use its new position.
6. Save, load, export or import the world using the existing Worlds controls. Asset identity, roles, appearance, dimensions and collision settings survive the round trip. World loading resets navigation from the saved robot start; there is no background job to resume.

## VR/AR workflow

The existing Control Palette has **Assets** and **Routes** tabs. Assets lists six items per page with More/Previous and ±90° rotation. Aim at ground using the existing ray/touch interactions to preview and place. Routes lists placed destinations, six per page, and sends the robot to the chosen marker. Editing continues through the existing Edit page, object handles and hand grabs. Keep XR transforms outside the world root; all placement, previews and goals are local map coordinates.

Rays default off in the Quest integration. Enable them from the wrist menu for distant pointing. Physical Quest text legibility, six-tab targeting, hand placement and comfort are NOT TESTED in this session.

## Shared action contract

`worldActions` now exposes:

- `selectCatalogAsset(id)` selects an item and activates the catalog tool.
- `rotateCatalogAsset(direction)` rotates the pending placement, where direction is 1 or -1.
- `previewCatalogAsset([x,z])` returns `{ object, valid }` using the same transform as placement.
- `placeCatalogAsset([x,z])` validates overlap and returns `{ ok, id }` or `{ ok: false, error }`.
- `listDestinations()` lists marker IDs, names, roles and current local points.
- `sendRobotToDestination(id)` validates the marker and route before setting the goal.

The catalog renderer uses saved object dimensions and optional identity; unknown optional metadata is ignored with validation warnings on import. Existing files without metadata remain valid v1 worlds. A previous application version can still read the base object kinds, but cannot preserve metadata it does not recognize.

## Validation

`npm test`: **159 passed across 19 files**. `npm run build`: **passed**. Existing Vite config-loader and bundle-size warnings remain.

New regressions cover every catalog object's collision policy, independent object dimensions, rotated bounds, invalid inputs, preview/commit consistency, solid-overlap rejection, walkable road overlays, separating-axis footprint checks, undo/redo, duplicate metadata, serialization repairs, saved-world/import round trips, destinations after edits/removal/obstruction, all preset marker routes and obstacle-triggered replanning.

Desktop browser: loaded Warehouse, placed a rack, dispatched to charging and inspection markers, saved a 47-object facility, refreshed and reloaded it with all five destination controls present. No captured browser console errors. Screenshot: `/tmp/realmforge-warehouse-preview.png`.

## Deliberate scope

Pickup/delivery/charging/inspection are functional navigation destinations. Conveyor movement, physical cargo handling, battery simulation, automatic task sequencing and return-to-charger behavior are not implemented. Those remain the next task-loop milestone. The current warehouse is ready to author and navigate a facility, with the original A* planner and editing history intact.
