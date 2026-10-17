import { LineSegments2 } from 'three-stdlib'

/**
 * Safety net for drei's fat lines (Line, Edges, Segments → three-stdlib Line2/LineSegments2).
 *
 * Their raycast needs `raycaster.camera` for screen-space widths; XR ray pointers don't set one, so a
 * single fat line in the scene made every ray throw on every frame and froze the app as soon as rays were
 * turned on. Lines here are decoration, so without a camera they're simply not hit. Lines that already
 * pass `raycast={() => null}` never get this far.
 */
let installed = false
export function installLineRaycastGuard() {
  if (installed) return
  installed = true
  const original = LineSegments2.prototype.raycast
  LineSegments2.prototype.raycast = function (raycaster, intersects) {
    if (!(raycaster as { camera?: unknown }).camera) return
    original.call(this, raycaster, intersects)
  }
}
