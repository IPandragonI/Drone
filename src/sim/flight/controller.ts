import { Quaternion, Vector3 } from "three";
import type { DronePhysics } from "@/config/drones/types";
import type { DroneInput, FlightMode } from "@/sim/types";

const DEG = Math.PI / 180;

export interface ControllerOutput {
  /** Desired body rates, rad/s [x pitch, y yaw, z roll]. */
  desiredRates: Vector3;
  /** Commanded body torque, N m. */
  torque: Vector3;
  /** Commanded collective thrust, N. */
  collective: number;
}

export function createControllerOutput(): ControllerOutput {
  return { desiredRates: new Vector3(), torque: new Vector3(), collective: 0 };
}

/** Stick shaping for acro: rate = max * (expo * s^3 + (1 - expo) * s). */
export function shapeStick(s: number, expo: number): number {
  return expo * s * s * s + (1 - expo) * s;
}

/** Throttle curve for collective thrust. */
export function throttleCurve(t: number, expo: number): number {
  const c = Math.min(1, Math.max(0, t));
  return (1 - expo) * c + expo * c * c * c;
}

const _up = new Vector3();
const _qInv = new Quaternion();

/**
 * Roll/pitch attitude from the world "up" vector expressed in the body frame.
 * pitch: rotation about +X (nose up positive); roll: rotation about +Z (left roll positive).
 * atan2 keeps the angles continuous through inverted flight.
 */
export function attitudeAngles(q: Quaternion, out: { pitch: number; roll: number }): void {
  _qInv.copy(q).invert();
  _up.set(0, 1, 0).applyQuaternion(_qInv);
  out.pitch = Math.atan2(-_up.z, _up.y);
  out.roll = Math.atan2(_up.x, _up.y);
}

const _ang = { pitch: 0, roll: 0 };

/**
 * Flight controller: sticks -> desired body rates -> torque command, plus collective thrust.
 * All three modes share this rate loop; they differ only in how desired rates are produced.
 *
 * @param q          drone orientation (world)
 * @param bodyRates  measured angular velocity in the body frame, rad/s
 * @param maxCollective maximum total thrust available (N), includes battery sag
 */
export function runFlightController(
  input: DroneInput,
  mode: FlightMode,
  q: Quaternion,
  bodyRates: Vector3,
  p: DronePhysics,
  maxCollective: number,
  out: ControllerOutput,
): void {
  const maxRoll = p.maxRatesDegS.roll * DEG;
  const maxPitch = p.maxRatesDegS.pitch * DEG;
  const maxYaw = p.maxRatesDegS.yaw * DEG;

  // Acro rate targets (sign convention: +pitch stick = nose down => negative body x rate).
  const acroPitch = -shapeStick(input.pitch, p.rateExpo) * maxPitch;
  const acroRoll = -shapeStick(input.roll, p.rateExpo) * maxRoll;
  const yawRate = -shapeStick(input.yaw, p.rateExpo) * maxYaw;

  let wx = acroPitch;
  let wz = acroRoll;

  if (mode !== "acro") {
    attitudeAngles(q, _ang);
    const maxTilt = p.maxTiltDeg * DEG;
    // Angle mode targets
    const pitchTarget = -input.pitch * maxTilt;
    const rollTarget = -input.roll * maxTilt;
    const angleWx = clamp(p.angleGain * (pitchTarget - _ang.pitch), -maxPitch, maxPitch);
    const angleWz = clamp(p.angleGain * (rollTarget - _ang.roll), -maxRoll, maxRoll);
    if (mode === "angle") {
      wx = angleWx;
      wz = angleWz;
    } else {
      // Horizon: level correction fades out with stick deflection; rate command fades in.
      const bx = Math.abs(input.pitch);
      const bz = Math.abs(input.roll);
      const levelX = clamp(p.angleGain * (0 - _ang.pitch), -maxPitch, maxPitch);
      const levelZ = clamp(p.angleGain * (0 - _ang.roll), -maxRoll, maxRoll);
      wx = (1 - bx) * levelX + bx * acroPitch;
      wz = (1 - bz) * levelZ + bz * acroRoll;
    }
  }

  out.desiredRates.set(wx, yawRate, wz);

  // Rate loop in angular-acceleration units, scaled by inertia to get torque.
  const [ix, iy, iz] = p.inertia;
  const kp = p.rateGain;
  out.torque.set(
    ix * kp * (wx - bodyRates.x),
    iy * kp * 0.6 * (yawRate - bodyRates.y),
    iz * kp * (wz - bodyRates.z),
  );

  out.collective = throttleCurve(input.throttle, p.throttleExpo) * maxCollective;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
