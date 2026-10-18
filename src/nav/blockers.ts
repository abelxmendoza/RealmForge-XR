/**
 * Fixed obstacles that aren't world objects, such as the walls and furniture of an imported scan.
 * Stored as x,z pairs in world metres; buildGrid() blocks the cells around each point.
 */
let points: Float32Array = new Float32Array(0)

export function setStaticBlockers(next: Float32Array) {
  points = next
}

export function staticBlockers(): Float32Array {
  return points
}
