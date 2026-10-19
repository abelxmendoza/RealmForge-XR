# VR and AR control palette

The desktop HUD is HTML, and HTML is not drawn inside an immersive WebXR session. So the headset gets its own
panels that **look like the HUD**: same cards, tabs, buttons, colours, fonts and labels.

## How the panels are built

`src/xr/panel/` draws every XR panel (palette, guide, wrist menu, error fallback):

| File | Job |
| --- | --- |
| `layout.ts` | Cards, rows and button grids laid out in CSS px, like the HUD. Pure: unit-tested without a canvas. |
| `draw.ts` | Paints a layout on a canvas with the HUD's CSS values (`HUD` in `src/theme/forge.ts`): 12px cards, 8px buttons, ember gradient for "on", Sora / Bricolage Grotesque. |
| `XRPanel.tsx` | One canvas texture on one plane per panel; hit-tests pointers by UV, hover, press feedback, haptics, grab strip to move it. |
| `pressGate.ts` | One press per touch: a pointer must lift before it can press again, so a page change under your ray or finger never presses the new page's button. |

`src/xr/paletteModel.ts` decides what the palette shows (`buildPalette`, pure, unit-tested) and
`src/xr/ControlPalette.tsx` renders it. Labels come from the HUD's own lists (`src/editor/toolbar.ts`), so the two
never drift apart. **If you change the HUD's CSS, change `HUD` in `src/theme/forge.ts` too.**

## The palette

- **Title bar:** grab strip (move it), ← Home, Exit VR, Collapse / Expand, Close.
- **Tabs:** Build, Edit, Routes, Test, View, Save — the HUD's sections, plus Edit (the desktop folds editing into Build; the headset's edit actions need their own page). It opens on the tab the desktop HUD
  was on, and the HUD follows the palette when you take the headset off.
- **Page:** a 3-column grid. Sub-pages (Object catalog, Event objects, Actors, Materials, Saved worlds, Real room,
  Styles) have **‹ Back** and a breadcrumb; Back always returns where you came from.
- **Status:** robot / selection pill and the last message (voice results, errors).
- **Footer:** Voice command, Undo, Redo, Guide, Recenter.

A confirmation (replace world, overwrite a save, delete an actor) takes over the page with Cancel / Confirm and
reopens the palette in front of you if it was closed or collapsed. Delete for objects does not ask: one Undo restores it.

## Always a way back

| Want to… | Palette | Wrist menu | Voice |
| --- | --- | --- | --- |
| Go back a page | ‹ Back | ‹ Back | "go back" |
| Get the menu back | — | Menu | "show the menu" |
| Clear your view | Close / Collapse | Hide all | "hide the menu", "hide everything" |
| Leave the headset | Exit VR | Exit VR | "exit VR" |
| Back to the landing page | ← Home | Home | "go home" ("go home now" skips the unsaved-changes question) |

Rays always reach the menus, so you can point at the palette from anywhere. The **Rays** setting (wrist, View page,
X key) now only decides whether rays also edit the world; with it off you grab and poke objects directly.

## Wrist menu

Hands: turn your left palm toward your face. Controllers: press **Y** to pin it open (Y again hides it), or raise the
left controller to chest height and turn its top toward your face. A controller held normally no longer pops it up.
Poke with your right index finger, or point a ray. Buttons: Menu, Hide all, Guide, ‹ Back, Home, Mic, Recenter,
Select, Exit VR, plus the Rays / Snap / Occlusion / Real-surfaces toggles and, with a framed group, Copy / Delete / Clear.

## Errors

**Never open a modal `<dialog>` during an XR session.** `showModal()` makes the page inert and that swallows every
XR press, so the headset can't be used until the dialog closes (which nobody can see). DOM modals check
`useInXRSession()` (`src/xr/xrStore.ts`) and stay closed; the XR panels show the same thing.

Each XR menu sits in its own error boundary (`src/xr/XRErrorBoundary.tsx`) and its own Suspense boundary, separate
from the world. A crash in one menu shows a small panel in front of you (Try again / Exit VR / Reload) instead of
taking the headset view down; a slow asset never blanks the world. Controller models and fonts ship with the app
(`public/xr-profiles/`, `@fontsource`), so nothing in the headset depends on a CDN.

## Testing

- `npm test` covers layouts, hit-testing, the press gate, the palette model, wrist and guide content.
- `npm run test:xr` runs the app in Chromium with Meta's WebXR emulator (a Quest 3 with Touch Plus controllers). It
  enters VR, aims the controller ray at buttons by id and pulls the trigger, and checks state and console. Close-up
  screenshots land in `e2e/artifacts/`. See `e2e/xr.e2e.mjs`.

Still to check on real hardware: text size and comfort at arm's length, hand-tracking pokes, Y-to-pin and the
raised-controller gesture on Quest 2 / 3 / 3S.
