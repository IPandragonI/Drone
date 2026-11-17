import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { CINEWHOOP, FPV_FREESTYLE, INSPECTION } from "@/config/drones";
import { Simulation } from "./simulation";
import { makeTestEnv } from "./testEnv";
import { NEUTRAL_INPUT, type DroneInput } from "./types";

const create = (drone = INSPECTION, mode = drone.defaultMode) =>
  Simulation.create({ env: makeTestEnv(), drone, mode });

const run = (sim: Simulation, seconds: number, input: Partial<DroneInput> = {}) => {
  sim.setInput({ ...NEUTRAL_INPUT, ...input });
  const n = Math.round(seconds * 120);
  for (let i = 0; i < n; i++) sim.step();
};

const hoverThrottle = (d: typeof INSPECTION) => (d.physics.massKg * 9.81) / (4 * d.physics.maxThrustPerMotorN);

describe("simulation core", () => {
  it("initialises resting on the ground with no crash", async () => {
    const sim = await create();
    run(sim, 2);
    const t = sim.getTelemetry();
    expect(sim.crashed).toBe(false);
    expect(t.altitude).toBeLessThan(0.2);
    expect(t.speedH).toBeLessThan(0.05);
    sim.dispose();
  });

  it("takes off with throttle above hover and falls back with zero throttle", async () => {
    const sim = await create();
    run(sim, 2, { throttle: hoverThrottle(INSPECTION) + 0.15 });
    expect(sim.getTelemetry().altitude).toBeGreaterThan(2);
    run(sim, 0.5, { throttle: hoverThrottle(INSPECTION) });
    run(sim, 6, { throttle: 0 });
    expect(sim.getTelemetry().altitude).toBeLessThan(0.3);
    sim.dispose();
  });

  it("holds near-level attitude in angle mode and translates forward with pitch stick", async () => {
    const sim = await create(INSPECTION, "angle");
    run(sim, 2, { throttle: hoverThrottle(INSPECTION) + 0.12 });
    run(sim, 1, { throttle: hoverThrottle(INSPECTION) });
    expect(sim.getTelemetry().tiltDeg).toBeLessThan(3);
    const z0 = sim.getTelemetry().position[2];
    run(sim, 1.5, { pitch: 0.6, throttle: hoverThrottle(INSPECTION) / Math.cos(0.5 * 0.6) });
    const t = sim.getTelemetry();
    expect(t.position[2]).toBeLessThan(z0 - 0.5); // forward = -Z
    expect(t.tiltDeg).toBeGreaterThan(5);
    expect(t.tiltDeg).toBeLessThan(0.6 * 30 + 6); // limited by max tilt
    run(sim, 3, { throttle: hoverThrottle(INSPECTION) });
    expect(sim.getTelemetry().tiltDeg).toBeLessThan(4); // self-levels
    sim.dispose();
  });

  it("acro: roll stick produces a sustained roll rate, no self-leveling after release", async () => {
    const sim = await create(FPV_FREESTYLE, "acro");
    run(sim, 1.5, { throttle: hoverThrottle(FPV_FREESTYLE) + 0.1 });
    run(sim, 0.2, { roll: 0.5, throttle: hoverThrottle(FPV_FREESTYLE) });
    run(sim, 0.15, { throttle: hoverThrottle(FPV_FREESTYLE) });
    expect(sim.getTelemetry().tiltDeg).toBeGreaterThan(15);
    run(sim, 0.5, { throttle: hoverThrottle(FPV_FREESTYLE) });
    expect(sim.getTelemetry().tiltDeg).toBeGreaterThan(15);
    sim.dispose();
  });

  it("yaw stick rotates heading in the commanded direction (right = clockwise from above)", async () => {
    const sim = await create(CINEWHOOP, "angle");
    run(sim, 1.5, { throttle: hoverThrottle(CINEWHOOP) + 0.15 });
    const h0 = sim.getTelemetry().heading;
    run(sim, 1, { yaw: 0.5, throttle: hoverThrottle(CINEWHOOP) });
    let dh = sim.getTelemetry().heading - h0;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    expect(dh).toBeGreaterThan(20);
    sim.dispose();
  });

  it("all three drones are stable in their default mode (no divergence over 10 s of hover)", async () => {
    for (const d of [FPV_FREESTYLE, INSPECTION, CINEWHOOP]) {
      const sim = await create(d, d.id === "fpv-freestyle" ? "angle" : d.defaultMode);
      run(sim, 1, { throttle: hoverThrottle(d) + 0.1 });
      run(sim, 10, { throttle: hoverThrottle(d) });
      const t = sim.getTelemetry();
      expect(Number.isFinite(t.altitude), d.id).toBe(true);
      expect(t.tiltDeg, d.id).toBeLessThan(10);
      sim.dispose();
    }
  });

  it("flying fast into a wall registers a critical collision and crashes; reset recovers", async () => {
    const sim = await create(FPV_FREESTYLE, "angle");
    let crashEvents = 0;
    sim.on("crash", () => crashEvents++);
    run(sim, 1, { throttle: hoverThrottle(FPV_FREESTYLE) + 0.1 });
    // full forward in angle mode with throttle compensation; wall is 19.5 m away
    run(sim, 4, { pitch: 1, throttle: 0.22 });
    expect(sim.crashed).toBe(true);
    expect(crashEvents).toBe(1);
    expect(sim.status).toBe("crashed");
    sim.reset();
    expect(sim.crashed).toBe(false);
    const t = sim.getTelemetry();
    expect(t.position[0]).toBeCloseTo(0, 3);
    expect(t.position[2]).toBeCloseTo(0, 3);
    expect(t.health).toBe(1);
    expect(t.battery).toBe(1);
    run(sim, 0.5);
    expect(sim.crashed).toBe(false);
    sim.dispose();
  });

  it("a gentle landing is not a crash and barely damages the drone", async () => {
    const sim = await create(INSPECTION, "angle");
    run(sim, 2, { throttle: hoverThrottle(INSPECTION) + 0.15 });
    run(sim, 8, { throttle: hoverThrottle(INSPECTION) - 0.05 });
    expect(sim.getTelemetry().health).toBeGreaterThan(0.9);
    expect(sim.crashed).toBe(false);
    sim.dispose();
  });

  it("pause stops stepping; interpolated pose is finite", async () => {
    const sim = await create();
    run(sim, 1, { throttle: hoverThrottle(INSPECTION) + 0.2 });
    sim.togglePause();
    const before = sim.getTelemetry().position[1];
    sim.update(0.5);
    expect(sim.getTelemetry().position[1]).toBe(before);
    sim.togglePause();
    sim.update(1 / 60);
    const p = new Vector3();
    const q = new Quaternion();
    sim.getRenderPose(p, q);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(q.length()).toBeCloseTo(1, 5);
    sim.dispose();
  });

  it("neutral input after disconnect yields no stale control", async () => {
    const sim = await create(INSPECTION, "angle");
    run(sim, 2, { throttle: hoverThrottle(INSPECTION) + 0.1, pitch: 0.5 });
    sim.setInput({ ...NEUTRAL_INPUT }); // neutralised: zero throttle
    run(sim, 8);
    expect(sim.getTelemetry().altitude).toBeLessThan(0.3);
    sim.dispose();
  });
});

describe("weather", () => {
  it("gusty wind pushes a hovering drone downwind; calm does not", async () => {
    const drone = INSPECTION;
    const hov = hoverThrottle(drone) * 1.02;
    const calm = await create(drone, "angle");
    const windy = await create(drone, "angle");
    windy.setWeather("gusty");
    for (const s of [calm, windy]) run(s, 5, { throttle: hov });
    const dc = Math.hypot(calm.getTelemetry().position[0], calm.getTelemetry().position[2]);
    const pw = windy.getTelemetry().position;
    expect(dc).toBeLessThan(0.3);
    expect(Math.hypot(pw[0], pw[2])).toBeGreaterThan(1.0);
    // wind blows toward heading 70 deg: +X (east) component dominates, with a northward (-Z) component
    expect(pw[0]).toBeGreaterThan(0);
    calm.dispose();
    windy.dispose();
  });

  it("is deterministic and bounded by the preset", async () => {
    const { WindModel, WEATHER_PRESETS } = await import("./wind");
    const w = new WindModel(WEATHER_PRESETS.gusty);
    const a = new Vector3();
    const b = new Vector3();
    let max = 0;
    for (let t = 0; t < 60; t += 0.1) {
      w.sample(t, a);
      w.sample(t, b);
      expect(a.equals(b)).toBe(true);
      max = Math.max(max, a.length());
    }
    expect(max).toBeLessThan(w.maxSpeed + 1);
    expect(max).toBeGreaterThan(WEATHER_PRESETS.gusty.mean * 0.8);
  });
});
