# Merge audit: duplicates and mismatches (Abel + Emiliano branches)

The two branches were built and tested separately (Abel mostly on desktop, Emiliano on the Quest) and merged late.
This lists what the merge left doubled up or inconsistent, what was fixed on `vr-ui-overhaul`, and what is left to
decide.

## Fixed

| Problem | Where | Fix |
| --- | --- | --- |
| **Headset froze on any confirmation or when opening the guide**: no button could be pressed, not even Confirm, Cancel or Close | The desktop confirmation and guide are modal `<dialog>`s; `showModal()` makes the page inert, and that swallowed every XR pointer press too. In VR the palette showed Confirm / Cancel but they were dead | Neither modal opens during an XR session (`useInXRSession` in `src/xr/xrStore.ts`); the palette and XR guide handle it. Covered by two e2e tests |
| The whole world went blank in the headset on a bad network | drei `<Text>` fetched font data from a CDN; while it loaded React hid every top-level object (Suspense) | Local font for every `<Text>` (`src/theme/fonts.ts`), self-hosted Sora / Bricolage; XR menus and the world in separate Suspense boundaries |
| Controllers could fail to appear offline ("Failed to fetch" on entering XR) | `@react-three/xr` loaded controller profiles from jsdelivr | Profiles bundled in `public/xr-profiles/` (`baseAssetPath` in `src/xr/xrStore.ts`) |
| Two copies of three.js in the bundle ("Multiple instances of Three.js") | drei's `stats-gl` pins `three@0.170` | `resolve.dedupe: ['three']` in `vite.config.ts` |
| Two XR menus on top of each other | With controllers the wrist menu showed in a normal grip (its grip "up" tilts back ~45°) and covered the palette | Controllers: Y pins the wrist menu, or raise and turn the controller clearly toward your face; hands unchanged |
| Couldn't press the palette from where it appears | Rays were off by default, and with rays off the palette (0.8 m away) was out of reach | Rays always reach menus; the Rays setting now only controls rays in the world |
| Button presses skipped or bounced ("trouble going back") | Palette tiles fired on every pointer down with no lift check, so a page change under the ray pressed the new page's button | `src/xr/panel/pressGate.ts`: one press per touch, plus a short cooldown |
| Two UI rendering styles in the headset | Palette: per-tile canvas textures redrawn on every hover; wrist / move bars: troika text; none looked like the HUD | One renderer (`src/xr/panel/`) painting with the HUD's CSS values |
| Palette page requests nobody read | `openPalettePage` / `page` / `request` in `paletteUI.ts` were set but never consumed | Page history lives in `paletteUI.ts` and drives the palette, wrist Back and voice |
| Desktop HUD and VR palette tracked their sections separately | `useHudSection` vs palette `page` state | Palette opens on the HUD's tab; the HUD follows the palette after you exit |
| Four delete paths, three behaviours | Palette: confirm, single object; wrist / keyboard / red cube: framed group, no confirm; voice: confirm, single | One path (`src/editor/deleteObjects.ts`): group or selection, one undo step, double buzz |
| Deleting a framed group needed one undo per object | `removeObject` per id | `removeObjects` (one store update, one undo step) |
| Palette Taller / Shorter moved 0.25 m, the keyboard and height snapping use 0.5 m | `src/xr/paletteActions.ts` vs `App.tsx` | 0.5 m everywhere |
| Two world-menu controllers, copy-pasted, each with its own busy flag (a save in one could run during a load in the other) | `worldsMenuController.ts`, `libraryMenuController.ts` | Shared `worldMenuCore.ts`: one busy guard, one set of feedback helpers |
| Dead code | `EnvironmentsMenu.tsx`, `StartChooser.tsx`, `environmentMenuController.ts` (never mounted); `PanelMoveBar.tsx`, `BrandLogo3D.tsx` (replaced); `deletePaletteSelection`, `loadPaletteEnvironment`, `blankPaletteWorld` (unused) | Removed with their tests |
| Landing page did not build | The PR #31 merge dropped `InstallButton` but kept its two call sites | Restored (on `easier-delete`) |
| A broken XR menu took the headset view down; Enter VR failures were unhandled | No error boundaries in the XR scene; `xrStore.enterVR()` promise ignored | `XRErrorBoundary` per menu with Try again / Exit VR / Reload; `enterVRSafely` shows the error in the HUD |

## Still doubled up (needs a decision, not changed)

1. **Two route systems.** The robot's route stops (`src/nav/routePlan.ts`: "Add Waypoint", Play / Pause / Next Stop)
   and RealmForge Flow (`src/flow/`: "Flow Route", drafted waypoints, zones, routes assigned to agents) both place
   waypoints on the map. Voice now treats "add waypoint here" as one command (Flow while you're drafting a Flow
   route, otherwise a robot stop), but the data models are separate. Suggest: one route model, with Flow's features
   on top of the robot's stops.
2. **Two world-library UIs.** The Inspector's Worlds panel (`WorldsPanel.tsx`) and the World Library modal
   (`WorldLibrary.tsx`) save, load, rename and delete the same worlds. Suggest keeping the modal and having the
   Inspector open it.
3. **Desktop HUD Delete still asks to confirm**; every other delete (keyboard, palette, wrist, voice) relies on Undo.
4. **`xr-test/`** is a standalone headset test page with its own copy of the AR session fallback, and it ships in the
   production build (`vite.config.ts` input). Now that `npm run test:xr` exists, it could be dropped or kept dev-only.
5. Small helper copies: `clampPoint` (`flow/placement.ts`, `world/spawn.ts`), `sameVec2` (`world/history.ts`,
   `world/store.ts`), `noHit` (5 files).

## Testing the two ways at once

`npm run test:xr` runs the real app in a simulated Quest 3 (Meta's IWER emulator) from a desktop browser, so the
desktop-first and headset-first workflows now share one check. It does not replace a pass on the device: comfort,
text size, hand-tracking pokes and the controller gestures still need a headset.
