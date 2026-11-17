import type { Vec3Tuple } from "@/sim/types";

/** Horizontal (XZ) distance from a point to a polyline of 3D points. Used to keep scatter objects off flight corridors. */
export function distToRouteXZ(x: number, z: number, route: Vec3Tuple[]): number {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, , az] = route[i];
    const [bx, , bz] = route[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
