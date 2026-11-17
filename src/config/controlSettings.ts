import { DEFAULT_AXIS_SHAPING, type AxisShaping } from "@/sim/input/normalize";
import type { KeyAction, KeyboardLayout } from "./controls";
import { mergeTuning, type DroneTuning } from "./tuning";

export type StickMode = 1 | 2;

export interface AxisCalibration {
  center: number;
  min: number;
  max: number;
}

export interface GamepadProfile {
  /** Mode 2: left = throttle/yaw, right = pitch/roll. Mode 1: left = pitch/yaw, right = throttle/roll. */
  stickMode: StickMode;
  /** Raw axis indices for [leftX, leftY, rightX, rightY] (standard mapping by default). */
  axisMap: [number, number, number, number];
  calibration: [AxisCalibration, AxisCalibration, AxisCalibration, AxisCalibration];
  roll: AxisShaping;
  pitch: AxisShaping;
  yaw: AxisShaping;
  throttle: AxisShaping;
  /** 'integrate': stick rate changes throttle (suits self-centering pads). 'absolute': stick position = throttle. */
  throttleMode: "integrate" | "absolute";
  /** Throttle change per second at full stick (integrate mode). */
  throttleRate: number;
  /** Button indices (standard mapping: 0 A/Cross, 2 X/Square, 3 Y/Triangle, 5 RB/R1, 9 Start). */
  buttons: { reset: number; pause: number; camera: number; cycleMode: number };
}

const cal = (): AxisCalibration => ({ center: 0, min: -1, max: 1 });

export const DEFAULT_GAMEPAD_PROFILE: GamepadProfile = {
  stickMode: 2,
  axisMap: [0, 1, 2, 3],
  calibration: [cal(), cal(), cal(), cal()],
  roll: { ...DEFAULT_AXIS_SHAPING, expo: 0.2 },
  pitch: { ...DEFAULT_AXIS_SHAPING, expo: 0.2 },
  yaw: { ...DEFAULT_AXIS_SHAPING, expo: 0.1 },
  throttle: { ...DEFAULT_AXIS_SHAPING, deadzone: 0.08 },
  throttleMode: "integrate",
  throttleRate: 0.7,
  buttons: { reset: 3, pause: 9, camera: 2, cycleMode: 5 },
};

export interface KeyboardSettings {
  /** "auto" detects the physical layout (AZERTY/QWERTY) at flight start. */
  layout: "auto" | KeyboardLayout;
  /** The pilot's own bindings per action, on top of the layout defaults. */
  overrides: Partial<Record<KeyAction, string[]>>;
}

export interface ControlSettings {
  gamepad: GamepadProfile;
  keyboard: KeyboardSettings;
  /** Per-drone flight tuning (rates, expo, self-levelling), keyed by drone id. */
  droneTuning: Record<string, DroneTuning>;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = { gamepad: DEFAULT_GAMEPAD_PROFILE, keyboard: { layout: "auto", overrides: {} }, droneTuning: {} };

/** Merge stored (possibly older/invalid) settings over defaults, validating every field. */
export function mergeControlSettings(stored: unknown): ControlSettings {
  const d = structuredClone(DEFAULT_CONTROL_SETTINGS);
  if (!stored || typeof stored !== "object") return d;
  const st = stored as { keyboard?: { layout?: unknown; overrides?: unknown }; droneTuning?: unknown };
  if (st.keyboard && typeof st.keyboard === "object") {
    if (st.keyboard.layout === "azerty" || st.keyboard.layout === "qwerty") d.keyboard.layout = st.keyboard.layout;
    if (st.keyboard.overrides && typeof st.keyboard.overrides === "object") d.keyboard.overrides = st.keyboard.overrides as KeyboardSettings["overrides"];
  }
  if (st.droneTuning && typeof st.droneTuning === "object") {
    for (const [id, v] of Object.entries(st.droneTuning as Record<string, unknown>)) {
      const t = mergeTuning(v);
      if (Object.keys(t).length) d.droneTuning[id] = t;
    }
  }
  const g = (stored as { gamepad?: Partial<GamepadProfile> }).gamepad;
  if (!g || typeof g !== "object") return d;
  const out = d.gamepad;
  if (g.stickMode === 1 || g.stickMode === 2) out.stickMode = g.stickMode;
  if (g.throttleMode === "integrate" || g.throttleMode === "absolute") out.throttleMode = g.throttleMode;
  if (typeof g.throttleRate === "number" && g.throttleRate > 0 && g.throttleRate < 5) out.throttleRate = g.throttleRate;
  if (Array.isArray(g.axisMap) && g.axisMap.length === 4 && g.axisMap.every((n) => Number.isInteger(n) && n >= 0)) {
    out.axisMap = g.axisMap as GamepadProfile["axisMap"];
  }
  if (Array.isArray(g.calibration) && g.calibration.length === 4) {
    const ok = g.calibration.every((c) => c && [c.center, c.min, c.max].every(Number.isFinite) && c.max > c.center && c.min < c.center);
    if (ok) out.calibration = g.calibration as GamepadProfile["calibration"];
  }
  for (const k of ["roll", "pitch", "yaw", "throttle"] as const) {
    const s = g[k];
    if (s && [s.deadzone, s.expo, s.sensitivity].every(Number.isFinite) && typeof s.invert === "boolean") {
      out[k] = {
        deadzone: Math.min(0.9, Math.max(0, s.deadzone)),
        expo: Math.min(1, Math.max(0, s.expo)),
        sensitivity: Math.min(3, Math.max(0.1, s.sensitivity)),
        invert: s.invert,
      };
    }
  }
  if (g.buttons) out.buttons = { ...out.buttons, ...g.buttons };
  return d;
}
