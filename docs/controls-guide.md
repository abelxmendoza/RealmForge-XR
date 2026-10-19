# User & controls guide

Shared help for desktop and immersive XR. Content lives in `src/guide/controlsGuide.ts`; open state in `src/guide/guideStore.ts`.

## How to open

| Surface | Action |
| --- | --- |
| Desktop HUD | **Guide** (session bar) or “Open user & controls guide”; key **?** |
| VR / AR wrist menu | Left palm toward face → **Guide** |
| VR / AR control palette | Footer **Guide** tile |

Desktop renders `ControlsGuide` (HTML dialog). Headset renders `ControlsGuidePanel` (Three.js tiles in tracking space). Same sections: Start, Hands, Wrist, Panel, Tools, Voice, Keys, Tips.

## VR UX notes

- One section at a time; short lines (≤56 characters).
- Guide sits at comfortable reading distance; **Recenter** / **Close guide** always available.
- Prefer progressive disclosure over dumping the full README into XR.

## Tabletop and immersive editing

Wrist menu **Tabletop** and **Enter world**, or palette **View**, switch presentation of the same editable world. Desktop **View → World scale** uses the same switching action. Enter world uses life-size scale and places the selected object 1.5 m ahead of the viewer; without a selection it uses the robot start. This is scene placement, not free locomotion or collision-aware teleportation.

Objects, selection, undo history and routes are shared in both views. Switching ends an active drag and cancels scan measurement picks. Entering life size releases AR table/floor anchoring, so a pinned miniature is not enlarged at table height. Return recenters the miniature; re-pin it with **View → Place world (AR)** if desired. A physical table is optional: the default miniature sits ahead on the floor.

A selected object's footprint may enclose the entry location; use an open area near the robot start for large objects. Scanned meshes do not automatically generate navigation collision or elevated walking surfaces. Physical Quest validation is still required.
