import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { EnvironmentDef, Solid } from "@/env/types";
import type { Vec3Tuple } from "@/sim/types";
import type { MissionDef } from "./types";

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _c = new Vector3();

/** Does a sphere overlap a solid (box or Y-axis cylinder, with Euler rotation)? */
export function sphereHitsSolid(center: Vec3Tuple, radius: number, s: Solid): boolean {
  if (s.collide === false) return false;
  _e.set(...(s.rotation ?? [0, 0, 0]), "XYZ");
  _q.setFromEuler(_e);
  _p.set(...s.position);
  _m.compose(_p, _q, _s).invert();
  _c.set(...center).applyMatrix4(_m);
  if (s.shape === "box") {
    const dx = Math.max(Math.abs(_c.x) - s.size[0] / 2, 0);
    const dy = Math.max(Math.abs(_c.y) - s.size[1] / 2, 0);
    const dz = Math.max(Math.abs(_c.z) - s.size[2] / 2, 0);
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  }
  const dr = Math.max(Math.hypot(_c.x, _c.z) - s.size[0], 0);
  const dy = Math.max(Math.abs(_c.y) - s.size[1] / 2, 0);
  return dr * dr + dy * dy <= radius * radius;
}

export function pointBlocked(env: EnvironmentDef, p: Vec3Tuple, radius: number): Solid | null {
  for (const s of env.solids) if (sphereHitsSolid(p, radius, s)) return s;
  return null;
}

/** First blocked point along a straight segment (sampled), or null. A conservative "a path exists" check. */
export function segmentBlocked(env: EnvironmentDef, a: Vec3Tuple, b: Vec3Tuple, radius: number, step = 0.25): Vec3Tuple | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Vec3Tuple = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    if (pointBlocked(env, p, radius)) return p;
  }
  return null;
}

/**
 * Static sanity checks for a mission: waypoints are in free space (with the drone's clearance) and, for ordered
 * missions, a straight line from the spawn through the waypoints is clear. Returns human-readable problems.
 */
export function validateMission(def: MissionDef, env: EnvironmentDef, clearance = 0.35): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const w of def.waypoints) {
    if (ids.has(w.id)) issues.push(`duplicate waypoint id ${w.id}`);
    ids.add(w.id);
    const hit = pointBlocked(env, w.position, Math.min(w.radius, 1) * 0.6 + clearance);
    if (hit) issues.push(`${w.id} (${w.position.join(",")}) overlaps ${hit.material} solid at ${hit.position.join(",")}`);
  }
  if (def.ordered) {
    const sp = env.spawn.position;
    let prev: Vec3Tuple = [sp[0], sp[1] + clearance + 0.15, sp[2]]; // just above the floor point
    for (const w of def.waypoints) {
      const blocked = segmentBlocked(env, prev, w.position, clearance);
      if (blocked) issues.push(`straight path to ${w.id} blocked near ${blocked.map((v) => v.toFixed(1)).join(",")}`);
      prev = w.position;
    }
  }
  if (def.parTime >= def.timeLimit) issues.push("parTime must be below timeLimit");
  if (!(def.medals.gold > def.medals.silver && def.medals.silver > def.medals.bronze)) issues.push("medal thresholds must descend");
  return issues;
}
