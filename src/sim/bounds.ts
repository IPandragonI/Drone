export type BoundsState = "ok" | "warn" | "out";

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Metres of margin inside the edge where the pilot is warned before actually leaving the area. */
export const BOUNDS_WARN_MARGIN = 14;
/** Seconds outside the area before the flight is ended. */
export const BOUNDS_GRACE_S = 6;

/** Horizontal flight-area check: inside, inside but near the edge (warn), or outside. */
export function boundsState(x: number, z: number, b: Bounds, margin = BOUNDS_WARN_MARGIN): BoundsState {
  if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return "out";
  if (x < b.min[0] + margin || x > b.max[0] - margin || z < b.min[2] + margin || z > b.max[2] - margin) return "warn";
  return "ok";
}
