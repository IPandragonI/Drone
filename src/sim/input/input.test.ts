import { describe, expect, it } from "vitest";
import { applyDeadzone, applyExpo, normalizeInput, shapeAxis } from "./normalize";
import { KeyboardInput } from "./keyboard";
import { classifyCollision } from "@/sim/collision";

describe("normalizeInput", () => {
  it("clamps ranges and rejects NaN/garbage", () => {
    const n = normalizeInput({ roll: 5, pitch: -9, yaw: NaN, throttle: 2, reset: true });
    expect(n).toEqual({ roll: 1, pitch: -1, yaw: 0, throttle: 1, reset: true, pause: false });
    expect(normalizeInput({ throttle: -1 }).throttle).toBe(0);
    expect(normalizeInput(null).throttle).toBe(0);
    // untrusted remote value of the wrong type
    expect(normalizeInput({ roll: "1" as unknown as number }).roll).toBe(0);
  });
  it("deadzone rescales and expo/invert/sensitivity compose", () => {
    expect(applyDeadzone(0.04, 0.05)).toBe(0);
    expect(applyDeadzone(1, 0.1)).toBeCloseTo(1);
    expect(applyDeadzone(-0.55, 0.1)).toBeCloseTo(-0.5);
    expect(applyExpo(0.5, 1)).toBeCloseTo(0.125);
    expect(shapeAxis(1, { deadzone: 0, expo: 0, sensitivity: 2, invert: true })).toBe(-1);
  });
});

describe("keyboard", () => {
  it("slews sticks, releases to neutral, integrates throttle, never sticks on blur", () => {
    const k = new KeyboardInput();
    k.setKey("z", true);
    let s = k.sample(0.05);
    expect(s.pitch).toBeGreaterThan(0);
    expect(s.pitch).toBeLessThan(1);
    for (let i = 0; i < 20; i++) s = k.sample(0.05);
    expect(s.pitch).toBe(1);
    k.releaseAll();
    for (let i = 0; i < 20; i++) s = k.sample(0.05);
    expect(s.pitch).toBe(0);
    k.setKey("arrowup", true);
    for (let i = 0; i < 10; i++) s = k.sample(0.1);
    expect(s.throttle).toBeCloseTo(0.7, 5);
    k.neutralize();
    expect(k.sample(0.01).throttle).toBe(0);
  });
  it("emits edge events once per press", () => {
    const k = new KeyboardInput();
    k.setKey("r", true);
    k.setKey("r", true);
    expect(k.drainPressed()).toEqual(["reset"]);
    expect(k.drainPressed()).toEqual([]);
  });
});

describe("collision severity", () => {
  it("is monotonic in impact speed and depends on difficulty", () => {
    const order = ["none", "minor", "moderate", "severe", "critical"];
    let last = 0;
    for (let v = 0; v < 25; v += 0.25) {
      const idx = order.indexOf(classifyCollision(v, "normal"));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    expect(classifyCollision(5, "easy")).toBe("moderate");
    expect(classifyCollision(5, "hard")).toBe("severe");
    expect(classifyCollision(NaN)).toBe("none");
  });
});
