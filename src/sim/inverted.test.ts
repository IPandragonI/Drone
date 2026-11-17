import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { CINEWHOOP, FPV_FREESTYLE, INSPECTION } from "@/config/drones";
import type { FlightMode } from "./types";
import { NEUTRAL_INPUT } from "./types";
import { Simulation } from "./simulation";
import { makeTestEnv } from "./testEnv";

const hover = (d: typeof INSPECTION) => (d.physics.massKg * 9.81) / (4 * d.physics.maxThrustPerMotorN);

/** Tilt of the body "up" vector from world up, degrees (180 = upside down). */
const tilt = (sim: Simulation): number => {
  const r = sim.getBody().rotation();
  const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(r.x, r.y, r.z, r.w));
  return (Math.acos(Math.min(1, Math.max(-1, up.y))) * 180) / Math.PI;
};

describe("recovery from any attitude, including exactly inverted", () => {
  for (const drone of [FPV_FREESTYLE, INSPECTION, CINEWHOOP]) {
    for (const mode of ["angle", "horizon"] as FlightMode[]) {
      if (!drone.flightModes.includes(mode)) continue;
      for (const [label, rollDeg, pitchDeg] of [["inverted (roll 180)", 180, 0], ["inverted (pitch 180)", 0, 180], ["knife-edge past 120", 130, 40]] as const) {
        it(`${drone.id} ${mode}: ${label} levels out`, async () => {
          const sim = await Simulation.create({ env: makeTestEnv({ wall: false }), drone, mode });
          sim.debugTeleport(0, 80, 0);
          const q = new Quaternion().setFromEuler({ x: (pitchDeg * Math.PI) / 180, y: 0, z: (rollDeg * Math.PI) / 180, order: "XYZ" } as never);
          sim.getBody().setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
          sim.setInput({ ...NEUTRAL_INPUT, throttle: Math.min(1, hover(drone) * 1.6) });
          let leveledAt = -1;
          for (let i = 0; i < 120 * 6 && leveledAt < 0; i++) {
            sim.step();
            if (tilt(sim) < 6) leveledAt = i / 120;
          }
          expect(sim.crashed).toBe(false);
          expect(leveledAt).toBeGreaterThanOrEqual(0); // reached level
          expect(leveledAt).toBeLessThan(3.5);
          sim.dispose();
        });
      }
    }
  }
});
