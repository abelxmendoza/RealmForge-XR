# Your real room: real surfaces, spatial save, Scan room

All three use Quest **Space Setup** data (walls, floor, tables, couches, furniture boxes). If the wrist
status line says `room: not set up`, the headset isn't sharing any. Open the Control Palette's **View**
page, then **Scan room (Space Setup)**, or use Settings > Physical Space > Space Setup. Allow spatial data
when the browser asks.

## Respect real surfaces (P, HUD, wrist **Surf.**, palette View; off by default)
- Placed or released objects rest on the real table, desk or couch under them. Without one they rest on
  the ground. Surfaces above your eyes are ignored.
- While you move an object, it stops at real walls and furniture. Something already resting on furniture
  can slide across it.
- Not used at tabletop scale, where the whole map sits on one table. Furniture is treated as an upright box.
- Code: `src/xr/room.ts` (pure helpers, tested), `roomTracker.tsx` (reads the XR frame), `realSurfaces.ts`.

## Spatial save (per saved world, this headset only)
- Saving a world in AR also creates an anchor where the world sits and asks the headset to keep it
  (persistent anchors, Quest Browser).
- Loading that world in AR, or entering AR with it active, restores the anchor. The world and every object
  on it return to the same real spot, at the scale it was saved at.
- The handle lives in `localStorage` per saved world (`realmforge.spatial.v1.<id>`), never in exported world
  files, so files stay portable. Saved worlds with a spot show `(anchored)` in the palette's saved list.
- If the spot can't be found (another room, or anchors cleared), the Worlds page says `not found` and the
  world is placed normally.
- Code: `src/xr/spatialSave.tsx`.

## Wrist menu (slimmed)
- Row 1: **Rays · Snap · Occl. · Surf.** (lit = on).
- Row 2: **Center · Panel · Guide · Select**.
- A framed group adds **Copy · Delete · Clear**.
- Status line: scale · occlusion source · room size.
- Everything else (scale presets, real/virtual ground, gestures, mocap, place world, scan room) is on the
  Control Palette's **View** page.
