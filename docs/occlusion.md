# Occlusion: virtual objects hidden behind real ones

Off by default. Toggle it with **O** (desktop), the HUD **O Occlusion** button, or the wrist menu's **Occl.**
button (row 1). The wrist status line shows what is doing the hiding: `occlusion: depth`, `room`, `off`, or
`no depth or room`.

## How it picks a source (automatic)

| Headset | Source | What hides virtual objects |
| --- | --- | --- |
| Quest 3 / 3S | **depth**: live depth sensing | Everything real: walls, furniture, your hands, other people |
| Quest 2 | **room**: your Space Setup | Walls, tables, couches and other boxes from Space Setup. Hands and people do not |
| Neither | **none** | Nothing: set up your room (Settings > Physical Space > Space Setup) and allow it when asked |

- **Depth**: the session asks for `depth-sensing` (GPU). When the headset grants it, three.js draws a depth
  mesh before the scene. `src/xr/occlusion.tsx` shows or hides that mesh, so turning occlusion off really is off.
- **Room**: planes and meshes from `plane-detection` / `mesh-detection` are drawn with a depth-only material.
  It writes depth but no colour, so passthrough still shows. They cannot be pointed at or grabbed. The floor,
  ceiling and whole-room mesh are skipped, because they would hide the world's ground and low objects like pallets.

## Limits

- Depth edges are soft and a little blocky, and lag slightly behind fast hand motion.
- Room occlusion is static. If furniture moves, run Space Setup again.
- At tabletop scale, the table you pinned the world on is a Space Setup "table". It is drawn as a blocker,
  but objects sit on top of it, so they stay visible.

## Menus and rays are never hidden

The wrist menu, Control Palette, guide panel and pointer rays always draw on top, through real walls,
furniture, your hands and virtual objects. So you can always reach **Occl.** to turn occlusion off.
(`src/xr/UILayer.tsx`: these draw last, right after the depth buffer is cleared.)
