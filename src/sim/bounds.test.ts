import { describe, expect, it } from "vitest";
import { INSPECTION } from "@/config/drones";
import { boundsState } from "./bounds";
import { FlightSession } from "./session";
import { Simulation } from "./simulation";
import { makeTestEnv } from "./testEnv";

const B = { min: [-100, 0, -100] as [number, number, number], max: [100, 50, 100] as [number, number, number] };

describe("flight-area bounds", () => {
  it("classifies inside, near the edge and outside", () => {
    expect(boundsState(0, 0, B)).toBe("ok");
    expect(boundsState(95, 0, B)).toBe("warn");
    expect(boundsState(0, -90, B)).toBe("warn");
    expect(boundsState(101, 0, B)).toBe("out");
    expect(boundsState(0, -150, B)).toBe("out");
  });

  it("warns, then ends the flight with a reason after the grace period", async () => {
    const env = makeTestEnv({ wall: false });
    env.bounds = { min: [-50, 0, -50], max: [50, 50, 50] };
    const sim = await Simulation.create({ env, drone: INSPECTION, mode: "angle" });
    const session = new FlightSession(sim);
    session.keyboard.throttle = 0.5;
    session.tick(1 / 60);
    expect(session.getViewState().bounds).toBe("ok");
    sim.debugTeleport(42, 6, 0);
    session.tick(1 / 60);
    expect(session.getViewState().bounds).toBe("warn");
    sim.debugTeleport(60, 6, 0);
    session.tick(1 / 60);
    expect(session.getViewState().bounds).toBe("out");
    for (let i = 0; i < 60 * 8 && !sim.crashed; i++) {
      sim.debugTeleport(60, 6, 0); // keep it out while the grace timer runs
      session.tick(1 / 60);
    }
    expect(sim.crashed).toBe(true);
    expect(session.getViewState().crashReason).toMatch(/flight area/i);
    session.dispose();
  });

  it("returning inside cancels the countdown", async () => {
    const env = makeTestEnv({ wall: false });
    env.bounds = { min: [-50, 0, -50], max: [50, 50, 50] };
    const sim = await Simulation.create({ env, drone: INSPECTION, mode: "angle" });
    const session = new FlightSession(sim);
    session.keyboard.throttle = 0.5;
    session.tick(1 / 60);
    for (let i = 0; i < 120; i++) {
      sim.debugTeleport(60, 6, 0);
      session.tick(1 / 60);
    }
    expect(session.getViewState().boundsSecondsLeft).toBeLessThan(6);
    sim.debugTeleport(0, 6, 0);
    session.tick(1 / 60);
    expect(session.getViewState().bounds).toBe("ok");
    expect(session.getViewState().boundsSecondsLeft).toBe(6);
    for (let i = 0; i < 600; i++) session.tick(1 / 60);
    expect(sim.crashed).toBe(false);
    session.dispose();
  });
});
