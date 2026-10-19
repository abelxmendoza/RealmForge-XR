# RealmForge XR project landing page

The root URL introduces a robotics workspace and task-building sandbox. It leads with importing real-world Scaniverse mesh sections, editing the same scene in tabletop and life-size VR, current robot navigation, and the roadmap toward body-suit demonstrations and autonomous task learning. A simplified data-center inspection scenario is identified as the next milestone, not a shipped task. Art, film and gaming remain later possibilities. Existing world and venue templates and branded technology credits remain available.

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

## Events & venues section

The landing page includes a dedicated **Events & venues** block (`#events`) with:

1. Create → Configure → Simulate workflow copy
2. Cards for Empty Event Venue and Job Fair
3. Deep links into the editor for each venue
4. A short disclaimer that attendee simulation is illustrative (not a certified crowd / egress model)

## Loading and accessibility

The landing page loads React and its own scoped styles and SVG art. The editor, Three.js/WebXR, navigation listeners, history tracking and optional mocap client load on demand through `EditorEntry`. A loading message and retry/home state cover editor startup failures. Existing editor initialization behavior is retained after launch.

Responsive layouts cover desktop and mobile; the mobile header retains the main editor launch action. The page provides landmark navigation, a skip link, real links for navigation, named SVG illustrations, toggle state on preview buttons, visible keyboard focus, and reduced-motion styling for the decorative path and smooth scrolling. Headset compatibility is qualified in the footer.
