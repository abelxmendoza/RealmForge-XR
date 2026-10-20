# Perception scan map import (first integration slice)

The Worlds panel now has **Import scan map**. In the file picker select
`manifest.json`, `map.yaml` and `map.pgm` from one environment package together.
Files stay on the device. A nonempty current world uses the existing replacement
confirmation; cancellation leaves it intact. No source repository or service is
needed to load a compatible package.

Supported: perception_scan v1, metric z-up map frame and the fixed transform
`(x,y,z) -> (-y,z,-x)`. Binary 8-bit PGM maps use 0 occupied, 254 free, 205 unknown.
Occupied and unknown cells become row-compressed navigation blockers. PGM row
orientation and resolution are preserved. Robot placement is disabled initially:
place the robot in observed free space after inspecting the map. Unknown cells
are conservative blockers, not measured physical walls. Bounds/object limits
are checked before replacing the world; no silent cropping or scaling occurs.

This imports **2D navigation proxies**, not the reconstructed 3D room mesh.
Proxy heights (1.5 m) are illustrative, not measured object heights or drone
clearance. Connecting the existing property-scan GLB visuals to this occupancy import,
collision asset preparation and Gazebo
export remain future milestones. Exported world JSON preserves the source label
in its name but does not retain the raw scan, imagery or a full capture history.
Keep the original package separately. Desktop file selection is currently the
entrypoint; Quest folder access and XR-specific scan UI are not verified.

Reference contract and roadmap:
https://github.com/abelxmendoza/Jetson-RealSense-Perception/blob/feature/shared-environments/docs/ENVIRONMENT_CONTRACT.md
https://github.com/abelxmendoza/Jetson-RealSense-Perception/blob/feature/shared-environments/docs/PROJECT_PLAN.md

RealmForge owns this adapter; the producer does not own editor behavior.
Omega-Code and PX4 consume the environment independently. Keep standalone world
creation, legacy JSON imports, and phone/Scaniverse workflows independent.

Validation: unit tests cover provenance, frame rejection, missing/unsafe files,
PGM orientation, metric transforms, unknown blockers, bounds, and native world
parsing. A synthetic producer-generated fixture verifies package interoperability.
Browser rendering and headset behavior still require manual validation.

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
