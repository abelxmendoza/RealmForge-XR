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
