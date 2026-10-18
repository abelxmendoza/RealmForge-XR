# Scan-to-World: iPhone and Intel RealSense D455

## What works today

RealmForge's **Real-world scan** panel imports a single GLB file, estimates floor and wall alignment, supports scale measurement and adjustments, and stores the model in the local browser's IndexedDB. World JSON stores a reference, **not** the original mesh. Re-import the GLB on another device.

**Important:** The scan is a visual backdrop, not navigation collision geometry. Trace walls or add blocking objects in the editor for robot/attendee pathfinding. This is not a metric-accurate digital twin or certified occupancy/egress model.

## iPhone — easiest first test

1. Use a 3D scanning app such as Polycam or Scaniverse on the iPhone. Check which capture modes and GLB exports the installed app/version supports.
2. If the iPhone has a supported LiDAR sensor, choose a room/space scan mode. Without LiDAR, use the app's supported photogrammetry/photo capture workflow; an ordinary camera stream is not enough to recover full geometry automatically.
3. Move slowly, capture overlapping views, cover corners and furniture from several angles, and avoid mirrors/glass when possible.
4. Export a **single GLB**, ideally under 60 MB for phones and XR. RealmForge rejects scans over 250 MB.
5. Open RealmForge on desktop or iPhone, choose **Real-world scan → iPhone → Import scan (.glb)**, select the file, adjust alignment and scale, and add navigation obstacles manually.
6. Save the world; keep the original GLB for later re-linking.

A live iPhone camera feed is **not yet** a live 3D scanner inside RealmForge. Native iOS RoomPlan/ARKit integration or a server-side reconstruction pipeline would be separate future work.

## Intel RealSense D455 — existing hardware

Hardware confirmed in [Jetson-RealSense-Perception](https://github.com/abelxmendoza/Jetson-RealSense-Perception): **Intel RealSense D455**, **Jetson Orin Nano**, **Ubuntu 22.04**, **ROS 2 Humble**, `librealsense 2.x`, `realsense2_camera`. The repository already publishes a depth point cloud at `/camera/depth/color/points` and provides standalone capture scripts.

1. Connect the D455 over USB 3.x. Only one process can open it at a time.
2. Verify the device with `python3 scripts/check_realsense.py` in the perception repo.
3. Record synchronized color/depth data and camera poses. The existing point-cloud obstacle detector is **not** a full-room SLAM mapper; it cannot reconstruct a house simply by accumulating unregistered frames.
4. Add or run RTAB-Map RGB-D SLAM (or equivalent) to register frames and reconstruct a room. Export a textured mesh and convert to **GLB** (e.g. using Blender if needed).
5. Import the GLB through the **Real-world scan → RealSense D455** path. Check dimensions using the known-distance measurement tool.
6. Add navigation obstacles manually until automated collision extraction is implemented.

## Next engineering milestones

- **A:** Add a sample-room GLB test fixture and verify import, alignment, persistence, missing-file recovery and memory limits.
- **B:** Implement a separate offline D455 RGB-D mapping/export pipeline, with pose tracking and geometry validation.
- **C:** Derive an editable **reviewable** 2D occupancy footprint from imported meshes (floor vs vertical geometry, ceiling rejection, decimation, safe bounds). Never treat raw scan triangles as collision geometry automatically.
- **D:** Optionally add semantic labels using Roboflow or other detection models, paired with depth and calibrated camera poses.
- **E:** Explore native iOS RoomPlan export or photo-based reconstruction as a dedicated iPhone capture pipeline.

## Privacy and deployment

House scans can reveal room layout and personal possessions. Keep capture local by default, do not upload to a public repository or telemetry, and obtain consent before scanning other people's spaces. Browser IndexedDB storage is per device/browser origin; clearing site data can remove scans. Avoid pushing this branch to production until tested; preview builds can consume Vercel deployment quota.
