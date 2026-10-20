# Agent handoff

For shared-environment work read `docs/perception-scans.md` first.

Keep RealmForge sovereign: world authoring, desktop/XR editing, phone/Scaniverse
inputs and simulation preparation work independently of the perception repo,
Omega-Code and PX4. Exchange versioned files/messages; do not import sibling
source folders or move robot control into this repo.

The current perception importer handles 2D occupancy navigation proxies only.
It does not itself render a scanned mesh; existing property-scan GLB loading
is separate. It does not export Gazebo worlds,
provide real-camera SLAM or establish drone clearance. Source labels, metric
scale and coordinate conventions must remain explicit. Unknown map cells are
blocked. Preserve existing replacement confirmation and busy-action behavior.

Next shared-environment milestone: separate visual reconstructed geometry from
navigation/collision proxies, retaining correct metric alignment and source
metadata; then implement/test static Gazebo export. See the linked roadmap in
the scan documentation. Do not present planned integrations as completed.

Run the existing test suite, TypeScript build and production build for changes.
Use the existing world action/persistence APIs rather than a second world store.
