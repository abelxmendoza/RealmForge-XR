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

## General-purpose RealSense support and shared ownership

RealmForge-XR is a shared team project. RealSense environment support is a
reusable feature for any user with a compatible capture setup, not an Abel-only
integration or a dependency on Omega1/PX4. Keep RealmForge changes as reviewable
team proposals; do not merge or repurpose the project without authorization.

The independent core path is capture/reconstruction -> versioned environment
package -> neutral package-to-Gazebo conversion -> robot-specific consumers.
RealmForge is an optional authoring/import/export participant. A Gazebo exporter
must be usable without RealmForge. Existing phone/Scaniverse and authored-world
workflows remain standalone; RealSense users need neither phone scans nor the
personal robot repositories.

Public user workflow: capture with a compatible external RealSense tool, export
a validated metric package, import it into RealmForge, inspect/align visual and
navigation layers, and export supported environment assets. Initial support is
file-based; direct browser USB capture, automatic raw-camera reconstruction,
mesh/map alignment, multi-source fusion and Gazebo export are not implemented
by the current map importer. Do not advertise those as available.

Adapters validate contracts, not personal filesystem paths, device names or
robot identities. Hardware compatibility must be documented per tested model
and SDK/OS combination rather than claiming every RealSense device is supported.
