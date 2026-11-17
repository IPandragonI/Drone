import { describe, expect, it } from "vitest";
import { CINEWHOOP, FPV_FREESTYLE, INSPECTION } from "@/config/drones";
import type { DroneConfig } from "@/config/drones/types";
import { Simulation } from "./simulation";
import { makeTestEnv } from "./testEnv";
import { NEUTRAL_INPUT, type DroneInput, type FlightMode } from "./types";

/** Flight-mode validation: measured closed-loop behaviour of the full sim (motors, lag, Rapier) per drone. */
const hov = (d: DroneConfig) => (d.physics.massKg * 9.81) / (4 * d.physics.maxThrustPerMotorN);
const rad = (deg: number) => (deg * Math.PI) / 180;

async function airborne(d: DroneConfig, mode: FlightMode) {
  const sim = await Simulation.create({ env: makeTestEnv({ wall: false }), drone: d, mode });
  const go = (s: number, i: Partial<DroneInput>, cb?: (t: number) => void) => {
    sim.setInput({ ...NEUTRAL_INPUT, ...i });
    const n = Math.round(s * 120);
    for (let k = 0; k < n; k++) {
      sim.step();
      cb?.((k + 1) / 120);
    }
  };
  go(1.5, { throttle: hov(d) + 0.12 });
  go(1, { throttle: hov(d) });
  return { sim, go };
}

const ALL = [FPV_FREESTYLE, INSPECTION, CINEWHOOP];

describe("Angle mode", () => {
  for (const d of ALL) {
    it(`${d.id}: full stick reaches max tilt, <=15% overshoot, settles within 1 s`, async () => {
      const { sim, go } = await airborne(d, "angle");
      const target = d.physics.maxTiltDeg;
      let max = 0;
      let lastOutside = 0;
      go(3, { pitch: 1, throttle: hov(d) / Math.cos(rad(target)) }, (t) => {
        const tilt = sim.getTelemetry().tiltDeg;
        max = Math.max(max, tilt);
        if (Math.abs(tilt - target) > 1.5) lastOutside = t;
      });
      expect(sim.getTelemetry().tiltDeg).toBeCloseTo(target, 0);
      expect(max).toBeLessThanOrEqual(target * 1.15);
      expect(lastOutside).toBeLessThan(1);
      sim.dispose();
    });
    it(`${d.id}: returns to level within 0.8 s of releasing the stick`, async () => {
      const { sim, go } = await airborne(d, "angle");
      go(1, { pitch: 1, throttle: hov(d) / Math.cos(rad(d.physics.maxTiltDeg)) });
      let t90 = Infinity;
      go(3, { throttle: hov(d) }, (t) => {
        if (t90 === Infinity && sim.getTelemetry().tiltDeg < 2) t90 = t;
      });
      expect(t90).toBeLessThan(0.8);
      expect(sim.getTelemetry().tiltDeg).toBeLessThan(1);
      sim.dispose();
    });
  }
});

describe("Acro mode", () => {
  for (const d of [FPV_FREESTYLE, CINEWHOOP]) {
    it(`${d.id}: roll rate tracks the commanded rate within 5%`, async () => {
      const { sim, go } = await airborne(d, "acro");
      const st = 0.5;
      const p = d.physics;
      const want = (p.rateExpo * st ** 3 + (1 - p.rateExpo) * st) * p.maxRatesDegS.roll;
      let rate = 0;
      go(0.4, { roll: st, throttle: hov(d) }, (t) => {
        if (t > 0.3) {
          const w = sim.getBody().angvel();
          rate = (Math.hypot(w.x, w.y, w.z) * 180) / Math.PI;
        }
      });
      expect(Math.abs(rate - want) / want).toBeLessThan(0.05);
      sim.dispose();
    });
  }
});

describe("Horizon mode", () => {
  for (const d of [FPV_FREESTYLE, INSPECTION, CINEWHOOP]) {
    it(`${d.id}: full stick rolls past 90 deg (unlike Angle); released at 120 deg it self-levels`, async () => {
      const { sim, go } = await airborne(d, "horizon");
      let guard = 0;
      while (sim.getTelemetry().tiltDeg < 120 && guard++ < 300) go(0.02, { roll: 1, throttle: hov(d) });
      expect(sim.getTelemetry().tiltDeg).toBeGreaterThan(90); // Angle mode is capped far below this
      go(5, { throttle: hov(d) });
      expect(sim.getTelemetry().tiltDeg).toBeLessThan(2);
      sim.dispose();
    });
  }
  it("angle mode never exceeds its tilt limit where horizon does (same input)", async () => {
    const a = await airborne(FPV_FREESTYLE, "angle");
    let maxA = 0;
    a.go(0.5, { roll: 1, throttle: hov(FPV_FREESTYLE) }, () => (maxA = Math.max(maxA, a.sim.getTelemetry().tiltDeg)));
    expect(maxA).toBeLessThan(FPV_FREESTYLE.physics.maxTiltDeg * 1.15);
    a.sim.dispose();
  });
});
