import { Quaternion, Vector3 } from "three";
import type { DroneConfig } from "@/config/drones/types";
import { GRAVITY } from "@/config/sim";
import type { DroneInput, Vec3Tuple } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface AutopilotOptions {
  /** Cruise speed toward the next waypoint, m/s. */
  cruise: number;
  /** A waypoint counts as reached inside this radius, m. */
  radius: number;
}

/**
 * Simple waypoint autopilot for Angle mode. It produces the same stick inputs a pilot would (roll/pitch/yaw/throttle),
 * so the flight is genuinely simulated: used to record a real-physics demonstration flight (hero video) and to test that
 * mission routes are flyable. It is a demo helper, not a general navigation system.
 */
export class WaypointAutopilot {
  index = 0;
  private readonly hover: number;
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly dir = new Vector3();
  private readonly vErr = new Vector3();

  constructor(
    readonly waypoints: Vec3Tuple[],
    drone: DroneConfig,
    readonly opts: AutopilotOptions = { cruise: 5, radius: 1.4 },
  ) {
    this.hover = (drone.physics.massKg * GRAVITY) / (4 * drone.physics.maxThrustPerMotorN);
  }

  get done(): boolean {
    return this.index >= this.waypoints.length;
  }

  update(pos: Vector3, quat: Quaternion, vel: Vector3): Pick<DroneInput, "roll" | "pitch" | "yaw" | "throttle"> {
    const wp = this.waypoints[Math.min(this.index, this.waypoints.length - 1)];
    this.dir.set(wp[0] - pos.x, wp[1] - pos.y, wp[2] - pos.z);
    const dist = this.dir.length();
    if (!this.done && dist < this.opts.radius) this.index++;

    // Heading vectors from the current orientation, projected on the horizontal plane.
    this.fwd.set(0, 0, -1).applyQuaternion(quat);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);

    // Desired velocity: horizontal toward the waypoint at cruise speed (slowing near the end), vertical proportional.
    const horiz = Math.hypot(this.dir.x, this.dir.z);
    const speed = clamp(horiz * 0.9, 0.4, this.opts.cruise);
    const vdx = horiz > 1e-4 ? (this.dir.x / horiz) * speed : 0;
    const vdz = horiz > 1e-4 ? (this.dir.z / horiz) * speed : 0;
    const vdy = clamp(this.dir.y * 1.1, -1.6, 2.6);
    this.vErr.set(vdx - vel.x, 0, vdz - vel.z);
    const ef = this.vErr.dot(this.fwd);
    const er = this.vErr.dot(this.right);

    const pitch = clamp(ef * 0.055, -0.45, 0.45);
    const roll = clamp(er * 0.055, -0.45, 0.45);

    // Look where we are going.
    const want = horiz > 1.0 ? Math.atan2(this.dir.x, -this.dir.z) : Math.atan2(this.fwd.x, -this.fwd.z);
    const have = Math.atan2(this.fwd.x, -this.fwd.z);
    const yaw = clamp(wrapPi(want - have) * 0.8, -0.4, 0.4);

    // Throttle: hover compensated for tilt, plus a vertical-speed term.
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    const tiltComp = 1 / Math.max(0.55, up.y);
    // Never drop to zero collective mid-flight: with no thrust the mixer's airmode would still push the motors up to realise the torques.
    const throttle = clamp(this.hover * tiltComp + (vdy - vel.y) * this.hover * 0.22, this.hover * 0.55, 1);

    return { roll, pitch, yaw, throttle };
  }
}
