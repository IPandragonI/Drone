/**
 * X-configuration quad mixer.
 *
 * Motor order and positions (body frame, +X right, forward = -Z), a = arm / sqrt(2):
 *   0 front-right (+a, -a)   spin +1
 *   1 rear-right  (+a, +a)   spin -1
 *   2 rear-left   (-a, +a)   spin +1
 *   3 front-left  (-a, -a)   spin -1
 *
 * A motor at r = (x, 0, z) producing thrust T along +Y gives torque r x (0,T,0) = (-z T, 0, x T).
 * Reaction (yaw) torque about +Y is  c * s_i * T_i  (s_i = spin sign, c = yawTorqueRatio).
 *
 *   tauX = -a * sum(zs_i T_i)     (pitch, + = nose up)
 *   tauZ =  a * sum(xs_i T_i)     (roll,  + = roll left)
 *   tauY =  c * sum(s_i  T_i)     (yaw,   + = nose left)
 *
 * The sign vectors zs, xs, s and (1,1,1,1) are mutually orthogonal with norm^2 = 4, so the inverse is
 *   T_i = 1/4 * [ T + zs_i (-tauX/a) + xs_i (tauZ/a) + s_i tauY/c ].
 */

export const MOTOR_X_SIGN = [1, 1, -1, -1] as const;
export const MOTOR_Z_SIGN = [-1, 1, 1, -1] as const;
export const MOTOR_SPIN = [1, -1, 1, -1] as const;

export interface MixerGeometry {
  /** Lateral offset a = arm / sqrt(2), m. */
  offset: number;
  yawTorqueRatio: number;
}

export function mixerGeometry(armLengthM: number, yawTorqueRatio: number): MixerGeometry {
  return { offset: armLengthM / Math.SQRT2, yawTorqueRatio };
}

/**
 * Convert collective thrust (N) and body torques (N m) into four motor thrust targets (N).
 * Airmode-style desaturation: the common-mode thrust is shifted so that differential thrust
 * (which creates torque) is preserved whenever it fits in [0, maxPerMotor].
 */
export function mix(
  collective: number,
  tauX: number,
  tauY: number,
  tauZ: number,
  geo: MixerGeometry,
  maxPerMotor: number,
  out: Float64Array | number[],
): void {
  const { offset: a, yawTorqueRatio: c } = geo;
  const base = collective / 4;
  let lo = Infinity;
  let hi = -Infinity;
  const diff = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const d = 0.25 * (MOTOR_Z_SIGN[i] * (-tauX / a) + MOTOR_X_SIGN[i] * (tauZ / a) + MOTOR_SPIN[i] * (tauY / c));
    diff[i] = d;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  // If the differential span exceeds the motor range, scale it down uniformly (keeps torque direction).
  const span = hi - lo;
  let scale = 1;
  if (span > maxPerMotor) scale = maxPerMotor / span;
  lo *= scale;
  hi *= scale;
  // Shift common mode so that [base + lo, base + hi] lies inside [0, max]; prefer honouring torque over collective.
  let shift = base;
  if (shift + hi > maxPerMotor) shift = maxPerMotor - hi;
  if (shift + lo < 0) shift = -lo;
  for (let i = 0; i < 4; i++) {
    const t = shift + diff[i] * scale;
    out[i] = t < 0 ? 0 : t > maxPerMotor ? maxPerMotor : t;
  }
}

/** Forward model: total thrust and torques produced by actual motor thrusts (N). */
export function mixForward(
  thrusts: ArrayLike<number>,
  geo: MixerGeometry,
): { thrust: number; tauX: number; tauY: number; tauZ: number } {
  let thrust = 0;
  let tauX = 0;
  let tauY = 0;
  let tauZ = 0;
  for (let i = 0; i < 4; i++) {
    const t = thrusts[i];
    thrust += t;
    tauX += -geo.offset * MOTOR_Z_SIGN[i] * t;
    tauZ += geo.offset * MOTOR_X_SIGN[i] * t;
    tauY += geo.yawTorqueRatio * MOTOR_SPIN[i] * t;
  }
  return { thrust, tauX, tauY, tauZ };
}
