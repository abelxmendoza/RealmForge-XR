# VR and AR control palette

The desktop HUD is an HTML overlay and is not visible during immersive WebXR. `src/xr/ControlPalette.tsx` provides actual Three.js controls in both AR and VR using the existing XR pointer system. No external font download or new package is required.

On entering XR, the palette appears ahead and left of the user's starting view. It stays in tracking space, independent of the tabletop transform and world scale. Use a controller ray/trigger or supported hand ray/pinch. Rays default off in the latest Quest integration: enable them from the existing wrist menu (or desktop X shortcut) for distant pointing; the palette also includes a Rays toggle. Touches activate on pointer-down so a slow poke does not depend on a quick-click threshold. Header toggles visibility; Recenter panel places it in front of the current view again. A confirmation opens the palette automatically and cannot be hidden until answered. Text textures are disposed when replaced or unmounted.

- **Tools:** select/move, building, wall, road/platform, decoration, robot, destination, snap, route-block demo. Place world is available only in AR.
- **Worlds:** Forge District, Mars Outpost, Autonomous Warehouse, Blank World, Save world, Save as new, Browse saved worlds. Saved worlds are paginated six at a time.
- **Edit:** rotate ±15°, footprint size, height, material/style, roof, duplicate, delete. Buttons disable without a selection. Object placement/movement continues through the existing ground/object pointer interactions.
- **Brush:** cycle building style, wall/platform materials, roof, decoration kind and tree style for new objects.
- Undo/redo use existing history and display availability. Navigation status and selected kind appear above the controls; action results/errors appear below.

Environment and saved-world replacements, deleting an object, and overwriting a save use the existing shared confirmation flow. Confirm/Cancel are rendered in the headset. Concurrent palette actions are disabled during a request. Deletion captures the original object ID so changing selection while confirming does not delete a different object. Leaving XR unmounts its consumer and cancels pending confirmation when no UI remains. Desktop controls continue to use their existing interface.

Validation: action regression tests cover accepted/cancelled environment changes, missing confirmation UI, object edits and original-target deletion. Existing navigation, persistence, voice and coordinate tests continue to run. Build verifies the actual scene component wiring. Physical headset visual layout, controller targeting, hand pinch and comfort remain NOT TESTED.

Quest smoke checklist:

1. Enter VR; verify palette is visible in both eyes and text is legible. Repeat in AR.
2. Select each tool, aim at the ground and place/edit objects; no palette click should edit the world behind a button.
3. On Worlds choose Mars, cancel, verify world unchanged; choose again, confirm, verify appearance and robot path.
4. Edit a selected building, undo and redo. Change Brush defaults, then place a new object.
5. Save as new; browse saves, load and confirm. Save again and verify overwrite confirmation.
6. Delete selected, cancel, then confirm. Hide/show panel; recenter after turning. Exit/re-enter XR and verify fresh panel placement.
7. Run the B/Block route demo while robot is moving. Verify palette position remains independent of tabletop placement.

This additive palette is based on the latest main including Emiliano's wrist-menu/hand-grab integration. It leaves that menu intact and reuses its ray setting. The palette action helpers can also be reused from that menu.

Validation run for this change: `npm test` — 137 passed across 18 files; `npm run build` — passed. Existing Vite config-loader and large-bundle warnings remain.
