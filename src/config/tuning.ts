import type { DroneConfig } from "./drones/types";

/** Pilot-adjustable flight parameters. Every field is optional: missing = the drone's own default. */
export interface DroneTuning {
  maxRatesDegS?: { roll: number; pitch: number; yaw: number };
  /** Acro stick expo 0..1. */
  rateExpo?: number;
  /** Throttle curve expo 0..1. */
  throttleExpo?: number;
  /** Outer attitude-loop gain for Angle/Horizon (1/s): higher = snappier self-levelling. */
  angleGain?: number;
  /** Maximum tilt in Angle mode, degrees. */
  maxTiltDeg?: number;
}

export const TUNING_LIMITS = {
  rate: [40, 1200] as const,
  expo: [0, 1] as const,
  angleGain: [2, 16] as const,
  maxTiltDeg: [10, 70] as const,
};

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

/** Validate stored tuning for one drone; unknown or out-of-range values are clamped or dropped. */
export function mergeTuning(raw: unknown): DroneTuning {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: DroneTuning = {};
  const rates = r.maxRatesDegS as Record<string, unknown> | undefined;
  if (rates && typeof rates === "object") {
    const [lo, hi] = TUNING_LIMITS.rate;
    const roll = num(rates.roll, lo, hi);
    const pitch = num(rates.pitch, lo, hi);
    const yaw = num(rates.yaw, lo, hi);
    if (roll !== undefined && pitch !== undefined && yaw !== undefined) out.maxRatesDegS = { roll, pitch, yaw };
  }
  const re = num(r.rateExpo, ...TUNING_LIMITS.expo);
  if (re !== undefined) out.rateExpo = re;
  const te = num(r.throttleExpo, ...TUNING_LIMITS.expo);
  if (te !== undefined) out.throttleExpo = te;
  const ag = num(r.angleGain, ...TUNING_LIMITS.angleGain);
  if (ag !== undefined) out.angleGain = ag;
  const mt = num(r.maxTiltDeg, ...TUNING_LIMITS.maxTiltDeg);
  if (mt !== undefined) out.maxTiltDeg = mt;
  return out;
}

/** A copy of the drone with the pilot's tuning applied. The original config is never mutated. */
export function applyTuning(drone: DroneConfig, t: DroneTuning | undefined): DroneConfig {
  if (!t || Object.keys(t).length === 0) return drone;
  return {
    ...drone,
    physics: {
      ...drone.physics,
      maxRatesDegS: t.maxRatesDegS ?? drone.physics.maxRatesDegS,
      rateExpo: t.rateExpo ?? drone.physics.rateExpo,
      throttleExpo: t.throttleExpo ?? drone.physics.throttleExpo,
      angleGain: t.angleGain ?? drone.physics.angleGain,
      maxTiltDeg: t.maxTiltDeg ?? drone.physics.maxTiltDeg,
    },
  };
}
