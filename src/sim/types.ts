export type FlightMode = "angle" | "horizon" | "acro";
export type Vec3Tuple = [number, number, number];

/**
 * Normalised control state produced by every input device.
 * roll/pitch/yaw in [-1, 1] (+roll = right, +pitch = forward/nose down, +yaw = right),
 * throttle in [0, 1] (absolute collective).
 */
export interface DroneInput {
  roll: number;
  pitch: number;
  yaw: number;
  throttle: number;
  reset: boolean;
  pause: boolean;
}

export const NEUTRAL_INPUT: Readonly<DroneInput> = Object.freeze({
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: 0,
  reset: false,
  pause: false,
});

export type SimStatus = "flying" | "crashed" | "paused";
export type CollisionSeverity = "none" | "minor" | "moderate" | "severe" | "critical";

export interface CollisionEvent {
  severity: CollisionSeverity;
  /** Contact velocity change in m/s. */
  impactSpeed: number;
  /** World position of the drone at impact. */
  position: Vec3Tuple;
  time: number;
}

export interface Telemetry {
  /** Horizontal ground speed, m/s. */
  speedH: number;
  /** Vertical speed, m/s (+ up). */
  speedV: number;
  /** Height above world origin plane, m. */
  altitude: number;
  /** Heading 0..360 deg, 0 = -Z, clockwise seen from above. */
  heading: number;
  /** Battery 0..1. */
  battery: number;
  health: number;
  flightTime: number;
  /** Tilt from horizontal in degrees. */
  tiltDeg: number;
  /** Normalised rotor speed per motor, 0..1. */
  motors: [number, number, number, number];
  position: Vec3Tuple;
}
