import { describe, expect, it } from "vitest";
import { INSPECTION, CINEWHOOP } from "@/config/drones";
import { Simulation } from "@/sim/simulation";
import { NEUTRAL_INPUT, type DroneInput } from "@/sim/types";
import { buildIndustrialComplex } from "./industrial";

const run = (sim: Simulation, s: number, input: Partial<DroneInput>) => {
  sim.setInput({ ...NEUTRAL_INPUT, ...input });
  for (let i = 0; i < Math.round(s * 120); i++) sim.step();
};
const hover = (d: typeof INSPECTION) => (d.physics.massKg * 9.81) / (4 * d.physics.maxThrustPerMotorN);

describe("industrial complex", () => {
  it("is deterministic and has a clear, sizeable layout", () => {
    const a = buildIndustrialComplex();
    const b = buildIndustrialComplex();
    expect(a.solids).toEqual(b.solids);
    expect(a.solids.length).toBeGreaterThan(300);
    for (const s of a.solids) {
      expect(s.size.every((n) => Number.isFinite(n))).toBe(true);
      expect(s.position.every((n) => Number.isFinite(n))).toBe(true);
    }
  });

  it("spawn is collision-free: drone sits on the floor without damage", async () => {
    const sim = await Simulation.create({ env: buildIndustrialComplex(), drone: INSPECTION });
    run(sim, 2, {});
    const t = sim.getTelemetry();
    expect(sim.crashed).toBe(false);
    expect(t.health).toBe(1);
    expect(t.altitude).toBeLessThan(0.3);
    sim.dispose();
  });

  it("can take off and hover in the hall; the roof does not trap or crash it", async () => {
    const sim = await Simulation.create({ env: buildIndustrialComplex(), drone: CINEWHOOP });
    run(sim, 1.5, { throttle: hover(CINEWHOOP) + 0.1 });
    run(sim, 3, { throttle: hover(CINEWHOOP) });
    const t = sim.getTelemetry();
    expect(sim.crashed).toBe(false);
    expect(t.altitude).toBeGreaterThan(1);
    expect(t.altitude).toBeLessThan(12);
    sim.dispose();
  });

  it("flying into the south wall at speed damages the drone", async () => {
    const sim = await Simulation.create({ env: buildIndustrialComplex(), drone: CINEWHOOP, mode: "angle" });
    run(sim, 1, { throttle: hover(CINEWHOOP) + 0.15 });
    // yaw 0 faces -Z (north); fly backwards (pitch -1) into the south wall / roller door region at x=0 is open,
    // so go sideways into the east wall instead: roll right.
    run(sim, 6, { roll: 1, throttle: hover(CINEWHOOP) + 0.02 });
    expect(sim.getTelemetry().health).toBeLessThan(1);
    sim.dispose();
  });
});

describe("minimap geometry", () => {
  it("fits the structures and maps forward (-Z) upwards", async () => {
    const { computeMapRect, worldToMap } = await import("./mapBounds");
    const env = buildIndustrialComplex();
    const r = computeMapRect(env);
    expect(r.maxX - r.minX).toBeGreaterThan(40);
    expect(r.maxX - r.minX).toBeLessThan(120);
    const spawn = env.spawn.position;
    const [sx, sy] = worldToMap(spawn[0], spawn[2], r, 200, 200);
    const [fx, fy] = worldToMap(spawn[0], spawn[2] - 5, r, 200, 200);
    expect(sx).toBeGreaterThan(0);
    expect(sx).toBeLessThan(200);
    expect(fy).toBeLessThan(sy); // forward is up on screen
    expect(fx).toBeCloseTo(sx);
  });
});
