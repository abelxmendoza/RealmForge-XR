# RealmForge XR project landing page

The root URL is a responsive project introduction. It presents seven starting templates, shared worldbuilding tools, multi-stop routes, traffic zones, illustrative robot and attendee navigation, scan import, spatial controls, optional voice, and the local world library.

The interactive hero illustration switches between Empty Space, Job Fair, Music Festival, Forge District, Mars Outpost, Warehouse, and Factory Floor; the primary launch link follows the selected template.

The illustrations are local SVG compositions, explicitly identified as illustrations rather than live simulation frames. No stock imagery, downloaded fonts, new dependency, fabricated customer claim or external service is required.

## Entry points

- `/`: project landing page.
- `/?editor=1`: existing editor and starter scene.
- `/?editor=1&world=forge-district`: Forge District editor.
- `/?editor=1&world=mars-outpost`: Mars Outpost editor.
- `/?editor=1&world=warehouse`: Warehouse editor, including the catalog and markers.
- `/?editor=1&world=empty-event-venue`: Empty Event Venue (blank hall with entrance / exits).
- `/?editor=1&world=job-fair`: Job Fair template (registration, booths, seating, stage).
- `/?editor=1&world=music-festival`: Music Festival template.
- `/?editor=1&world=factory-floor`: Factory Floor template.
- `/xr-test/`: existing standalone Quest harness, unchanged.

Query entry points work on ordinary static servers without adding a router or requiring rewrite configuration. `readEntry` validates template IDs against `LANDING_TEMPLATES`. Editor initialization happens once before the React editor mounts; an explicitly selected template replaces only the boot-time starter scene. Saved worlds remain in the existing browser library. Unknown environment IDs open the default editor.

The editor's Home link returns to the project page. When world data is dirty it uses the existing confirmation UI first; Cancel retains the current editor state. Modified clicks retain normal link behavior. Save before leaving to keep edits.

## Events & venues section

The landing page includes a dedicated **Events & venues** block (`#events`) with:

1. Create → Configure → Simulate workflow copy
2. Cards for Empty Event Venue and Job Fair
3. Deep links into the editor for each venue
4. A short disclaimer that attendee simulation is illustrative (not a certified crowd / egress model)

## Loading and accessibility

The landing page loads React and its own scoped styles and SVG art. The editor, Three.js/WebXR, navigation listeners, history tracking and optional mocap client load on demand through `EditorEntry`. A loading message and retry/home state cover editor startup failures. Existing editor initialization behavior is retained after launch.

Responsive layouts cover desktop and mobile; the mobile header retains the main editor launch action. The page provides landmark navigation, a skip link, real links for navigation, named SVG illustrations, toggle state on preview buttons, visible keyboard focus, and reduced-motion styling for the decorative path and smooth scrolling. Headset compatibility is qualified in the footer.

## October 18 capability refresh

- Preserves the existing branding, empty-space default, template picker, and lazy editor/replay loading.
- Introduces Build → Plan → Test as a user workflow, rather than claiming an unmerged toolbar redesign.
- Adds `#workflow` and `#scans` sections with a working empty-world editor entry point and Build → Import scan instructions.
- Describes .glb scans as visual backdrops; navigation obstacles must be authored separately. Explains device-local scan storage and re-linking the source file on another device.
- Covers ordered waypoints, live replanning, traffic zones, hands/controllers, tabletop-to-life-size scaling, supported voice commands, typed fallback, and local saves/export.
- Labels the XR demo as a simulated replay, not physical-headset footage. Does not advertise unmerged compound AI worldbuilding, crowd physics, or compliance guarantees.
- Adds responsive scan/workflow layouts for phones in portrait and landscape, with no new dependencies.
