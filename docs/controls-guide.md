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
