import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { FPV_FREESTYLE, INSPECTION, CINEWHOOP } from "@/config/drones";
import { mix, mixForward, mixerGeometry } from "./mixer";
import { attitudeAngles, runFlightController, createControllerOutput, shapeStick, throttleCurve } from "./controller";
import { NEUTRAL_INPUT } from "@/sim/types";

describe("mixer", () => {
  const geo = mixerGeometry(0.115, 0.016);
  it("round-trips collective and torques when unsaturated", () => {
    const out = new Float64Array(4);
    mix(20, 0.2, -0.05, 0.3, geo, 12.5, out);
    const f = mixForward(out, geo);
    expect(f.thrust).toBeCloseTo(20, 6);
    expect(f.tauX).toBeCloseTo(0.2, 6);
    expect(f.tauY).toBeCloseTo(-0.05, 6);
    expect(f.tauZ).toBeCloseTo(0.3, 6);
  });
  it("never outputs outside [0, max] and preserves torque sign when saturated", () => {
    const out = new Float64Array(4);
    mix(48, 3, 0, 0, geo, 12.5, out);
    for (const t of out) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(12.5);
    }
    expect(mixForward(out, geo).tauX).toBeGreaterThan(0);
  });
});

describe("controller", () => {
  const p = FPV_FREESTYLE.physics;
  const maxC = p.maxThrustPerMotorN * 4;
  it("shapes sticks and throttle monotonic, bounded", () => {
    expect(shapeStick(1, 0.5)).toBeCloseTo(1);
    expect(shapeStick(0.5, 0.5)).toBeLessThan(0.5);
    expect(throttleCurve(2, 0)).toBe(1);
    expect(throttleCurve(-1, 0.3)).toBe(0);
  });
  it("acro: forward pitch stick commands nose-down rate (negative body x)", () => {
    const out = createControllerOutput();
    runFlightController({ ...NEUTRAL_INPUT, pitch: 1, throttle: 0.5 }, "acro", new Quaternion(), new Vector3(), p, maxC, out);
    expect(out.desiredRates.x).toBeLessThan(0);
    expect(out.torque.x).toBeLessThan(0);
    expect(out.collective).toBeCloseTo(0.5 * maxC);
  });
  it("acro: right roll stick commands negative body z rate, right yaw negative y", () => {
    const out = createControllerOutput();
    runFlightController({ ...NEUTRAL_INPUT, roll: 1, yaw: 1 }, "acro", new Quaternion(), new Vector3(), p, maxC, out);
    expect(out.desiredRates.z).toBeLessThan(0);
    expect(out.desiredRates.y).toBeLessThan(0);
  });
  it("angle: when tilted, neutral sticks command a restoring rate", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3); // rolled left 0.3 rad
    const a = { pitch: 0, roll: 0 };
    attitudeAngles(q, a);
    expect(a.roll).toBeCloseTo(0.3, 5);
    const out = createControllerOutput();
    runFlightController(NEUTRAL_INPUT, "angle", q, new Vector3(), INSPECTION.physics, 15, out);
    expect(out.desiredRates.z).toBeLessThan(0); // roll right to level
  });
  it("angle: pitch target is limited by max tilt, rates by max rate", () => {
    const out = createControllerOutput();
    runFlightController({ ...NEUTRAL_INPUT, pitch: 1 }, "angle", new Quaternion(), new Vector3(), CINEWHOOP.physics, 10, out);
    const maxRate = (CINEWHOOP.physics.maxRatesDegS.pitch * Math.PI) / 180;
    expect(Math.abs(out.desiredRates.x)).toBeLessThanOrEqual(maxRate + 1e-9);
    // at target tilt the command is ~0
    const tilt = (CINEWHOOP.physics.maxTiltDeg * Math.PI) / 180;
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt);
    runFlightController({ ...NEUTRAL_INPUT, pitch: 1 }, "angle", q, new Vector3(), CINEWHOOP.physics, 10, out);
    expect(Math.abs(out.desiredRates.x)).toBeLessThan(1e-6);
  });
  it("horizon: levels at neutral, acts like acro at full stick", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.5);
    const out = createControllerOutput();
    runFlightController(NEUTRAL_INPUT, "horizon", q, new Vector3(), p, maxC, out);
    expect(out.desiredRates.z).toBeLessThan(0);
    runFlightController({ ...NEUTRAL_INPUT, roll: 1 }, "horizon", q, new Vector3(), p, maxC, out);
    const acro = createControllerOutput();
    runFlightController({ ...NEUTRAL_INPUT, roll: 1 }, "acro", q, new Vector3(), p, maxC, acro);
    expect(out.desiredRates.z).toBeCloseTo(acro.desiredRates.z);
  });
  it("acro does not self-level", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.5);
    const out = createControllerOutput();
    runFlightController(NEUTRAL_INPUT, "acro", q, new Vector3(), p, maxC, out);
    expect(out.desiredRates.z).toBeCloseTo(0);
  });
});
