# RealmForge XR project landing page

The root URL is now a responsive project introduction. It presents the three environments, shared worldbuilding tools, configurable workers/courier robots/utility vehicles, robot navigation, spatial controls and local world library. Feature rows also cover expanded spoken/typed object commands, ten warehouse assets and destination markers, four presentation scales, JSON import/export with actors, optional Rokoko debug skeleton streaming, and the desktop/in-headset Guide. Integration requirements and navigation limits appear beside the relevant features. The interactive hero illustration switches between Forge District, Mars Outpost and Warehouse; the primary launch link follows the selected environment.

The illustrations are local SVG compositions, explicitly identified as illustrations rather than live simulation frames. The artwork needs no stock imagery or external service. Display fonts are requested from Google Fonts with local fallbacks; optional live speech and mocap have separate setup requirements.

## Entry points

- `/`: project landing page.
- `/?editor=1`: existing editor and starter scene.
- `/?editor=1&world=forge-district`: Forge District editor.
- `/?editor=1&world=mars-outpost`: Mars Outpost editor.
- `/?editor=1&world=warehouse`: Warehouse editor, including the new catalog and markers.
- `/xr-test/`: existing standalone Quest harness, unchanged.

Query entry points work on ordinary static servers without adding a router or requiring rewrite configuration. `readEntry` validates environment IDs. Editor initialization happens once before the React editor mounts; an explicitly selected template replaces only the boot-time starter scene. Saved worlds remain in the existing browser library. Unknown environment IDs open the default editor.

The editor's Home link returns to the project page. When world data is dirty it uses the existing confirmation UI first; Cancel retains the current editor state. Modified clicks retain normal link behavior. Save before leaving to keep edits.

## Loading and accessibility

The landing page loads React and its own scoped styles and SVG art. The editor, Three.js/WebXR, navigation listeners, history tracking and optional mocap client load on demand through `EditorEntry`. A loading message and retry/home state cover editor startup failures. Existing editor initialization behavior is retained after launch.

Responsive layouts cover desktop and mobile; the mobile header retains the main editor launch action. The page provides landmark navigation, a skip link, real links for navigation, named SVG illustrations, toggle state on preview buttons, visible keyboard focus, and reduced-motion styling for the decorative path and smooth scrolling. Headset compatibility is qualified in the footer.

## Earlier landing-page validation record

- `npm test`: **174 passed across 21 files**.
- `npm run build`: **passed**; the editor is emitted as a separate lazy-loaded chunk.
- Desktop browser: hero preview changed to Mars; Enter the forge opened the actual Mars editor and correct world name.
- Warehouse environment card opened the actual Warehouse editor with five catalog destination actions and Worlds library controls.
- Editing the warehouse then selecting Home opened the shared confirmation. Cancel retained the editor; Confirm returned to the landing page.
- Mobile breakpoint checked at 390px; document client width and scroll width both measured 375px (the remainder is the browser scrollbar), with no horizontal overflow.
- No captured browser console errors in the verified flow.
- Screenshots: `/tmp/realmforge-landing-desktop.png` and `/tmp/realmforge-landing-full.png`.

Large editor/emulation chunks and extensionless Vite config imports still produce existing build warnings. Physical Quest tests and hosted production deployment were not performed for this landing-page change.

## Capability content refresh

README and landing-page copy now cover actors, expanded object voice commands, warehouse tools, four world scales, saves, shared controls help and optional mocap, with implementation limits and setup requirements. Page metadata and the Warehouse card description reflect the expanded scope.

Validation: 219 tests passed across 29 files; TypeScript and production build passed. Existing Vite configuration and bundle-size warnings remain. This content refresh did not include a new browser layout or physical-headset check.
