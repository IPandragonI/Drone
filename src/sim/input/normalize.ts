import { NEUTRAL_INPUT, type DroneInput } from "@/sim/types";

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function finite(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Sanitise an arbitrary (possibly remote/untrusted) input into a valid DroneInput. */
export function normalizeInput(raw: Partial<DroneInput> | null | undefined): DroneInput {
  if (!raw) return { ...NEUTRAL_INPUT };
  return {
    roll: clamp(finite(raw.roll), -1, 1),
    pitch: clamp(finite(raw.pitch), -1, 1),
    yaw: clamp(finite(raw.yaw), -1, 1),
    throttle: clamp(finite(raw.throttle), 0, 1),
    reset: raw.reset === true,
    pause: raw.pause === true,
  };
}

/** Per-axis deadzone with rescaling so output still reaches +-1. */
export function applyDeadzone(v: number, deadzone: number): number {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const dz = clamp(deadzone, 0, 0.95);
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

/** Expo curve: 0 = linear, 1 = cubic. */
export function applyExpo(v: number, expo: number): number {
  return expo * v * v * v + (1 - expo) * v;
}

export interface AxisShaping {
  deadzone: number;
  expo: number;
  sensitivity: number;
  invert: boolean;
}

export const DEFAULT_AXIS_SHAPING: AxisShaping = { deadzone: 0.05, expo: 0, sensitivity: 1, invert: false };

export function shapeAxis(v: number, s: AxisShaping): number {
  let x = clamp(finite(v), -1, 1);
  x = applyDeadzone(x, s.deadzone);
  x = applyExpo(x, s.expo);
  x = clamp(x * s.sensitivity, -1, 1);
  return (s.invert ? -x : x) + 0; // + 0 normalises -0
}
