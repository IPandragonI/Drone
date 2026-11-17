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
const _ub = new Vector3();
const _ud = new Vector3();
const _fh = new Vector3();
const _rh = new Vector3();
const _axis = new Vector3();
const _err = new Vector3();

/**
 * Attitude error as a rotation vector in the body frame (x: pitch, z: roll), from the tilt the pilot asks for.
 * The error is the rotation taking the body "up" vector onto the desired "up" vector, so it is well defined for every
 * attitude including inverted (the old per-axis atan2 angles were ambiguous near 180 degrees). `tiltForward` / `tiltRight`
 * are tilt angles in radians relative to the drone's current heading.
 */
export function tiltError(q: Quaternion, tiltForward: number, tiltRight: number, out: { x: number; z: number }): void {
  _ub.set(0, 1, 0).applyQuaternion(q);
  // Heading: the nose direction on the horizontal plane; if the nose is near vertical, use the (negated) horizontal part of "up".
  _fh.set(0, 0, -1).applyQuaternion(q);
  _fh.y = 0;
  if (_fh.lengthSq() < 0.0225) {
    _fh.set(-_ub.x, 0, -_ub.z);
    if (_fh.lengthSq() < 0.0225) _fh.set(0, 0, -1);
  }
  _fh.normalize();
  _rh.set(-_fh.z, 0, _fh.x);
  _ud.set(0, 1, 0).addScaledVector(_fh, Math.tan(tiltForward)).addScaledVector(_rh, Math.tan(tiltRight)).normalize();

  _axis.crossVectors(_ub, _ud);
  const s = _axis.length();
  const c = _ub.dot(_ud);
  let angle = Math.atan2(s, c);
  if (s < 1e-6) {
    if (c > 0) {
      out.x = 0;
      out.z = 0;
      return;
    }
    // Exactly opposite: roll over about the body forward axis.
    _axis.set(0, 0, -1).applyQuaternion(q);
    angle = Math.PI;
  } else _axis.multiplyScalar(1 / s);
  _err.copy(_axis).multiplyScalar(angle).applyQuaternion(_qInv.copy(q).invert());
  out.x = _err.x;
  out.z = _err.z;
}

const _e = { x: 0, z: 0 };
const _lvl = { x: 0, z: 0 };

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
    const maxTilt = p.maxTiltDeg * DEG;
    // Angle mode: error toward the requested tilt (forward stick = nose down, right stick = bank right).
    tiltError(q, input.pitch * maxTilt, input.roll * maxTilt, _e);
    const angleWx = clamp(p.angleGain * _e.x, -maxPitch, maxPitch);
    const angleWz = clamp(p.angleGain * _e.z, -maxRoll, maxRoll);
    if (mode === "angle") {
      wx = angleWx;
      wz = angleWz;
    } else {
      // Horizon: level correction fades out with stick deflection; rate command fades in.
      tiltError(q, 0, 0, _lvl);
      const bx = Math.abs(input.pitch);
      const bz = Math.abs(input.roll);
      const levelX = clamp(p.angleGain * _lvl.x, -maxPitch, maxPitch);
      const levelZ = clamp(p.angleGain * _lvl.z, -maxRoll, maxRoll);
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
