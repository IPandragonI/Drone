import { describe, expect, it } from "vitest";
import { DEFAULT_GAMEPAD_PROFILE, mergeControlSettings, type GamepadProfile } from "@/config/controlSettings";
import { CalibrationRecorder, GamepadInput, calibrateAxis, readSticks, type PadSnapshot } from "./gamepad";
import { InputManager } from "./manager";
import { KeyboardInput } from "./keyboard";

const profile = (over: Partial<GamepadProfile> = {}): GamepadProfile => ({
  ...structuredClone(DEFAULT_GAMEPAD_PROFILE),
  roll: { deadzone: 0, expo: 0, sensitivity: 1, invert: false },
  pitch: { deadzone: 0, expo: 0, sensitivity: 1, invert: false },
  yaw: { deadzone: 0, expo: 0, sensitivity: 1, invert: false },
  throttle: { deadzone: 0, expo: 0, sensitivity: 1, invert: false },
  ...over,
});
const pad = (axes: number[], down: number[] = []): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })),
});

describe("stick modes", () => {
  it("Mode 2: right stick up = pitch forward, right x = roll, left y up = throttle up, left x = yaw", () => {
    const s = readSticks([0.5, -1, 1, -1], profile({ stickMode: 2 }));
    expect(s.pitch).toBe(1);
    expect(s.roll).toBe(1);
    expect(s.throttleStick).toBe(1);
    expect(s.yaw).toBe(0.5);
  });
  it("Mode 1: left stick y = pitch, right stick y = throttle", () => {
    const s = readSticks([0, -1, 0, 1], profile({ stickMode: 1 }));
    expect(s.pitch).toBe(1);
    expect(s.throttleStick).toBe(-1);
  });
  it("applies per-axis invert, deadzone and sensitivity", () => {
    const p = profile({ pitch: { deadzone: 0.1, expo: 0, sensitivity: 1, invert: true } });
    expect(readSticks([0, 0, 0, -1], p).pitch).toBe(-1);
    expect(readSticks([0, 0, 0, -0.05], p).pitch).toBe(0);
    const q = profile({ roll: { deadzone: 0, expo: 0, sensitivity: 0.5, invert: false } });
    expect(readSticks([0, 0, 1, 0], q).roll).toBe(0.5);
  });
});

describe("calibration", () => {
  it("recentres and rescales each half axis", () => {
    const c = { center: 0.1, min: -0.8, max: 0.6 };
    expect(calibrateAxis(0.1, c)).toBe(0);
    expect(calibrateAxis(0.6, c)).toBeCloseTo(1);
    expect(calibrateAxis(-0.8, c)).toBeCloseTo(-1);
    expect(calibrateAxis(NaN, c)).toBeCloseTo(-0.1 / 0.9);
  });
  it("recorder derives centre and range; rejects unmoved axes", () => {
    const r = new CalibrationRecorder([0, 1, 2, 3]);
    expect(r.result()).toBeNull();
    r.addCenterSample([0.05, -0.02, 0.0, 0.03]);
    r.addCenterSample([0.05, -0.02, 0.0, 0.03]);
    expect(r.result()).toBeNull(); // no range yet
    for (const v of [-0.9, 0.95]) {
      r.addRangeSample([v, v, v, v]);
    }
    const res = r.result();
    expect(res).not.toBeNull();
    expect(res![0].center).toBeCloseTo(0.05);
    expect(res![0].max).toBeCloseTo(0.95);
  });
});

describe("GamepadInput", () => {
  it("integrates throttle, cuts it on disconnect and emits button edges once", () => {
    let current: PadSnapshot | null = pad([0, -1, 0, 0]);
    const g = new GamepadInput(profile({ throttleRate: 0.5 }), () => [current]);
    for (let i = 0; i < 10; i++) g.sample(0.1);
    expect(g.throttle).toBeCloseTo(0.5);
    current = pad([0, 0, 0, 0], [3]);
    g.sample(0.1);
    g.sample(0.1);
    expect(g.drainPressed()).toEqual(["reset"]);
    current = null; // unplugged
    const out = g.sample(0.1);
    expect(g.connected).toBe(false);
    expect(out).toEqual({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
  });
  it("absolute throttle mode maps stick position to 0..1", () => {
    const g = new GamepadInput(profile({ throttleMode: "absolute" }), () => [pad([0, -1, 0, 0])]);
    expect(g.sample(0.01).throttle).toBe(1);
    const g2 = new GamepadInput(profile({ throttleMode: "absolute" }), () => [pad([0, 1, 0, 0])]);
    expect(g2.sample(0.01).throttle).toBe(0);
  });
});

describe("InputManager device switching and failsafe", () => {
  it("switches device on activity, carries throttle over, and neutralises on pad loss", () => {
    let current: PadSnapshot | null = null;
    const kb = new KeyboardInput();
    const gp = new GamepadInput(profile(), () => [current]);
    const m = new InputManager(kb, gp);
    kb.setKey("arrowup", true);
    for (let i = 0; i < 5; i++) m.sample(0.1);
    kb.setKey("arrowup", false);
    expect(m.active).toBe("keyboard");
    const thr = kb.throttle;
    expect(thr).toBeGreaterThan(0.2);
    current = pad([0, 0, 1, 0]); // push right stick: roll
    const s = m.sample(0.1);
    expect(m.active).toBe("gamepad");
    expect(s.device).toBe("gamepad");
    expect(s.throttle).toBeCloseTo(thr);
    expect(s.roll).toBe(1);
    current = null; // disconnect mid-flight
    const lost = m.sample(0.1);
    expect(lost).toMatchObject({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
    expect(m.sample(0.1).throttle).toBe(0);
  });
});

describe("control settings persistence merge", () => {
  it("falls back to defaults on garbage and clamps out-of-range values", () => {
    expect(mergeControlSettings("nope").gamepad.stickMode).toBe(2);
    const m = mergeControlSettings({ gamepad: { stickMode: 1, roll: { deadzone: 5, expo: -1, sensitivity: 99, invert: true }, calibration: [{ center: 0, min: 1, max: 0 }] } });
    expect(m.gamepad.stickMode).toBe(1);
    expect(m.gamepad.roll).toEqual({ deadzone: 0.9, expo: 0, sensitivity: 3, invert: true });
    expect(m.gamepad.calibration[0]).toEqual({ center: 0, min: -1, max: 1 }); // invalid calibration rejected
  });
});
