# RealmForge XR project landing page

The root URL is a responsive project introduction. It presents the three exploration environments, two event venue templates, shared worldbuilding tools, robot and attendee simulation, spatial controls, and the local world library.

The interactive hero illustration switches between Forge District, Mars Outpost, Warehouse, Empty Event Venue, and Job Fair; the primary launch link follows the selected template.

The illustrations are local SVG compositions, explicitly identified as illustrations rather than live simulation frames. No stock imagery, downloaded fonts, new dependency, fabricated customer claim or external service is required.

## Entry points

- `/`: project landing page.
- `/?editor=1`: existing editor and starter scene.
- `/?editor=1&world=forge-district`: Forge District editor.
- `/?editor=1&world=mars-outpost`: Mars Outpost editor.
- `/?editor=1&world=warehouse`: Warehouse editor, including the catalog and markers.
- `/?editor=1&world=empty-event-venue`: Empty Event Venue (blank hall with entrance / exits).
- `/?editor=1&world=job-fair`: Job Fair template (registration, booths, seating, stage).
- `/xr-test/`: existing standalone Quest harness, unchanged.

Query entry points work on ordinary static servers without adding a router or requiring rewrite configuration. `readEntry` validates template IDs against `LANDING_TEMPLATES`. Editor initialization happens once before the React editor mounts; an explicitly selected template replaces only the boot-time starter scene. Saved worlds remain in the existing browser library. Unknown environment IDs open the default editor.

The editor's Home link returns to the project page. When world data is dirty it uses the existing confirmation UI first; Cancel retains the current editor state. Modified clicks retain normal link behavior. Save before leaving to keep edits.

## Watch it in action (replays)

`#replays`, right after the capability strip, plays four short replays of real editor sessions in one player (`src/landing/ReplayReel.tsx`, clip list in `src/landing/replays.ts`):

1. **Build a scene from scratch** (desktop, Empty Space): buildings, a wall, trees, then a robot and a destination.
2. **Block the path, watch it replan** (desktop, Forge District): Block Path, then drag the wall; the robot reroutes.
3. **Run a job fair walkthrough** (desktop, Job Fair): start the virtual attendee.
4. **Grab the city in VR** (emulated Meta Quest 3): enter VR, grab a building with the controller, set it in the robot's path.

The player starts muted once it's scrolled into view (not with reduced motion), moves to the next clip when one ends, and pauses when scrolled away. Each clip ships as MP4 (H.264) with a WebM (VP9) fallback and a poster in `public/demos/`; the page labels them as simulated replays and says the VR one runs in an emulated headset.

### Re-recording the clips

The clips are scripted, so re-record them whenever the editor UI changes:

```sh
npx playwright install chromium   # once
npm run dev                       # keep running
npm run demos:record              # all clips, or e.g. `npm run demos:record -- vr`
```

`tools/record-demos.mjs` drives the editor at `https://127.0.0.1:5173/` (override with `DEMO_URL`) in headless Chromium and needs `ffmpeg` with libx264 and libvpx-vp9. For VR it installs the IWER emulator itself (Meta Quest 3 profile, no dev UI) and moves the emulated head and controllers. Software WebGL is slow, so the page clock is slowed down while recording (`DEMO_TIME_SCALE`, default 0.25) and frames are retimed afterwards; clips play at normal speed. If a scripted click lands under a HUD panel the script nudges it toward the map centre, and fails loudly if it can't.

## Events & venues section

The landing page includes a dedicated **Events & venues** block (`#events`) with:

1. Create → Configure → Simulate workflow copy
2. Cards for Empty Event Venue and Job Fair
3. Deep links into the editor for each venue
4. A short disclaimer that attendee simulation is illustrative (not a certified crowd / egress model)

## Loading and accessibility

The landing page loads React and its own scoped styles and SVG art. The editor, Three.js/WebXR, navigation listeners, history tracking and optional mocap client load on demand through `EditorEntry`. A loading message and retry/home state cover editor startup failures. Existing editor initialization behavior is retained after launch.

Responsive layouts cover desktop and mobile; the mobile header retains the main editor launch action. The page provides landmark navigation, a skip link, real links for navigation, named SVG illustrations, toggle state on preview buttons, visible keyboard focus, and reduced-motion styling for the decorative path and smooth scrolling. Headset compatibility is qualified in the footer.
