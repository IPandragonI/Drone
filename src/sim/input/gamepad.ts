import type { GamepadProfile, AxisCalibration } from "@/config/controlSettings";
import type { KeyAction } from "@/config/controls";
import { clamp, shapeAxis } from "./normalize";

export interface PadSnapshot {
  axes: ArrayLike<number>;
  buttons: ArrayLike<{ pressed: boolean }>;
}

/** Apply a calibration: recentre and rescale each half-axis separately so the full travel maps to +-1. */
export function calibrateAxis(raw: number, c: AxisCalibration): number {
  const v = Number.isFinite(raw) ? raw : 0;
  const d = v - c.center;
  const span = d >= 0 ? c.max - c.center : c.center - c.min;
  return span > 1e-6 ? clamp(d / span, -1, 1) : 0;
}

export interface Sticks {
  roll: number;
  pitch: number;
  yaw: number;
  /** Throttle stick deflection in [-1, 1], up positive (not yet integrated). */
  throttleStick: number;
}

/**
 * Map the four physical axes to control channels according to the stick mode.
 * Gamepad Y axes are -1 when pushed up, so Y is flipped to "up positive".
 */
export function readSticks(axes: ArrayLike<number>, p: GamepadProfile): Sticks {
  const a = (i: number) => calibrateAxis(axes[p.axisMap[i]] ?? 0, p.calibration[i]);
  const lx = a(0);
  const ly = -a(1);
  const rx = a(2);
  const ry = -a(3);
  const [pitch, roll, yaw, thr] =
    p.stickMode === 2
      ? [ry, rx, lx, ly] // Mode 2: right stick pitch/roll, left stick throttle/yaw
      : [ly, rx, lx, ry]; // Mode 1: left stick pitch/yaw, right stick throttle/roll
  return {
    roll: shapeAxis(roll, p.roll),
    pitch: shapeAxis(pitch, p.pitch),
    yaw: shapeAxis(yaw, p.yaw),
    throttleStick: shapeAxis(thr, p.throttle),
  };
}

type PadSource = () => ReadonlyArray<PadSnapshot | null>;

/**
 * Gamepad source. Polled once per frame (the Gamepad API has no input events for axes).
 * On disconnect everything is neutralised immediately: sticks 0, throttle cut.
 */
export class GamepadInput {
  connected = false;
  throttle = 0;
  private prevButtons: boolean[] = [];
  private pressed: KeyAction[] = [];
  private lastSticks: Sticks = { roll: 0, pitch: 0, yaw: 0, throttleStick: 0 };
  private activity = false;

  constructor(
    public profile: GamepadProfile,
    private getPads: PadSource = () => (typeof navigator !== "undefined" && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []),
  ) {}

  private pad(): PadSnapshot | null {
    for (const p of this.getPads()) if (p) return p;
    return null;
  }

  /** True when the pad was moved/pressed during the last sample (used to switch the active device). */
  hadActivity(): boolean {
    return this.activity;
  }

  drainPressed(): KeyAction[] {
    const q = this.pressed;
    this.pressed = [];
    return q;
  }

  sample(dt: number): { roll: number; pitch: number; yaw: number; throttle: number } {
    const pad = this.pad();
    if (!pad) {
      if (this.connected) {
        this.connected = false;
        this.throttle = 0; // failsafe: cut throttle on loss
        this.prevButtons = [];
      }
      this.activity = false;
      this.lastSticks = { roll: 0, pitch: 0, yaw: 0, throttleStick: 0 };
      return { roll: 0, pitch: 0, yaw: 0, throttle: this.throttle };
    }
    this.connected = true;
    const s = readSticks(pad.axes, this.profile);
    this.lastSticks = s;

    let act = Math.max(Math.abs(s.roll), Math.abs(s.pitch), Math.abs(s.yaw), Math.abs(s.throttleStick)) > 0.15;
    const b = this.profile.buttons;
    const map: Array<[number, KeyAction]> = [
      [b.reset, "reset"],
      [b.pause, "pause"],
      [b.camera, "toggleCamera"],
      [b.cycleMode, "modeCycle"],
    ];
    const isDown = (i: number) => !!pad.buttons[i]?.pressed;
    for (const [idx, action] of map) {
      if (isDown(idx) && !this.prevButtons[idx]) {
        this.pressed.push(action);
        act = true;
      }
    }
    for (let i = 0; i < pad.buttons.length; i++) this.prevButtons[i] = isDown(i);
    this.activity = act;

    if (this.profile.throttleMode === "absolute") {
      this.throttle = clamp((s.throttleStick + 1) / 2, 0, 1);
    } else {
      this.throttle = clamp(this.throttle + s.throttleStick * this.profile.throttleRate * dt, 0, 1);
    }
    return { roll: s.roll, pitch: s.pitch, yaw: s.yaw, throttle: this.throttle };
  }

  getLastSticks(): Sticks {
    return this.lastSticks;
  }
}

/** Calibration helper: accumulates centre (sticks released) and extremes (sticks rotated). */
export class CalibrationRecorder {
  private sums = [0, 0, 0, 0];
  private count = 0;
  private min = [Infinity, Infinity, Infinity, Infinity];
  private max = [-Infinity, -Infinity, -Infinity, -Infinity];

  constructor(private axisMap: GamepadProfile["axisMap"]) {}

  addCenterSample(axes: ArrayLike<number>): void {
    for (let i = 0; i < 4; i++) this.sums[i] += axes[this.axisMap[i]] ?? 0;
    this.count++;
  }

  addRangeSample(axes: ArrayLike<number>): void {
    for (let i = 0; i < 4; i++) {
      const v = axes[this.axisMap[i]] ?? 0;
      if (v < this.min[i]) this.min[i] = v;
      if (v > this.max[i]) this.max[i] = v;
    }
  }

  /** Returns null if not enough data (no centre samples or an axis was never moved through its range). */
  result(): GamepadProfile["calibration"] | null {
    if (this.count === 0) return null;
    const out: AxisCalibration[] = [];
    for (let i = 0; i < 4; i++) {
      const center = this.sums[i] / this.count;
      const min = this.min[i];
      const max = this.max[i];
      if (!Number.isFinite(min) || !Number.isFinite(max) || max - center < 0.3 || center - min < 0.3) return null;
      out.push({ center, min, max });
    }
    return out as GamepadProfile["calibration"];
  }
}
