# Property scans: web and immersive XR

Assemble a house, garage, and yard from multiple mesh scans. This is spatial viewing and planning on imported geometry; RealmForge does not capture scans itself or automatically reconstruct a house.

## Capture and import

1. Capture manageable, overlapping sections in Scaniverse (a kitchen, bathroom, living room, garage, front yard, backyard). Use a doorway or another shared feature to align neighbouring sections; record a real measured distance.
2. Export polygon **mesh GLB** assets, not Gaussian splats (SPZ/splat PLY). RealmForge supports uncompressed and Meshopt GLB; Draco is not supported. Scaniverse export availability depends on its app/experience and plan.
3. Open **Build → Property scans → Add scans (.glb)**. Multiple file selection adds sections; it does not replace existing sections. Auto-detected floor/orientation/unit scale is a starting guess, not a survey.
4. Give each section a name and floor/area label. Select it, position and rotate it until shared features line up, then measure two known points to calibrate its scale. Alignment is manual; there is no automatic scan stitching.
5. Set floor elevation for upper rooms or lower outdoor ground. Ceiling cut is relative to each section's own floor elevation. Hide or solo sections to inspect interiors and reduce rendering load.
6. Save the world as usual. Local saves and JSON preserve every section's metadata; original GLB files live in device-local IndexedDB.

## In the headset

Open **Build → Property scans** in the floating control palette. Cycle the selected section, show/hide/solo, adjust position in metres, rotate 5°, adjust scale 1%, opacity, ceiling cut, and floor labels. Long lists paginate above the footer instead of overlapping it.

**Measure scale** enables pointer rays: pick two visible scan points, set the actual distance using metre/centimetre buttons, then Apply. Mouse and XR points both convert through `worldRootRef` into property-local metres. Switching section, hiding it, or leaving measurement cancels stale picks. Scene placement and object-grab handlers do not edit objects while measuring.

Native file import/export and free-text naming use **Files / names (exit XR)**. This explicitly ends the immersive session and opens the same web property panel in the headset browser. Choose the file there, then re-enter XR. The app does not promise an immersive native file picker. A separate headset/device needs the scan files; switching the existing browser into XR uses the same in-memory world and storage.

## Transfer the whole property

Use **Export property bundle** to download `.rfproperty`, containing world JSON plus every scan's original GLB bytes, including hidden sections. Transfer it to the headset/computer and choose **Open property bundle**. This does not upload or publish the property.

Bundles use an 8-byte `RFPROP01` marker, uint32 little-endian manifest length, UTF-8 manifest, and consecutive GLB payloads. Imports check bounded manifest/file lengths, section/asset matches, GLB headers and declared lengths before staging assets. Section IDs are remapped so existing saved worlds' mesh files are not overwritten. Replacement still uses the shared web/XR confirmation flow. Cancel/failure cleans staged files.

Missing local files block bundle export with a relink instruction. Re-link the original GLB for that selected section; this preserves neighbours, custom name, alignment, and floor label. A different re-export may have changed its coordinate frame and should be checked again.

## Shared implementation

- `src/scan/store.ts`: section collection, selected-section aliases, per-section load state, measurement state, world-generation guard.
- `src/scan/actions.ts`: common movement, rotation, scaling, visibility and calibration actions used by DOM and in-headset controls.
- `src/scan/ScanLayer.tsx`: independent section transforms, section-relative clipping planes, selected-section raycasts; shared world root for web and XR. Hidden sections unmount and dispose model resources.
- `src/scan/propertyBundle.ts`: portable asset container and transfer.
- World persistence/validation: reads legacy single `scan` files, saves multi-section `scans`, tracks dirty changes across all sections, and clears/counts all sections when replacing a world.

## Boundaries and validation

- Maximum 24 sections and 250 MB of mesh files per property. These are storage safeguards, not a guarantee of headset performance: file bytes are not GPU memory, and all triangles in visible meshes are drawn. Prefer small simplified meshes and hide unused sections. Analysis samples at most 300k triangles; that does not simplify the rendered model.
- Property transforms can show elevated floors, but agent/navigation simulation remains on the existing flat 80 × 80 m plane. No stairs, terrain navigation, automatic room labels, automatic wall collision extraction, georeferencing, or survey accuracy is claimed. Add solid props to represent obstacles for navigation.
- A transparent shadow ground replaces the opaque virtual board while scan sections are visible so their floor textures remain visible.
- Automated tests use real generated GLB geometry for import, model loading, bundling/restoration, alignment, relinking, cancellation/truncation, world-change races, legacy migration, section limits, dirty tracking, and shared web/XR actions.
- Physical Quest and real Scaniverse-file validation remain required. No browser automation surface was available for visual QA in this environment.
