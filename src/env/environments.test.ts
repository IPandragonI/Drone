import { describe, expect, it } from "vitest";
import { DRONES } from "@/config/drones";
import { MISSIONS } from "@/missions/defs";
import { pointBlocked } from "@/missions/validate";
import { WaypointAutopilot } from "@/sim/autopilot";
import { Simulation } from "@/sim/simulation";
import { NEUTRAL_INPUT } from "@/sim/types";
import { Quaternion, Vector3 } from "three";
import { computeMapRect } from "./mapBounds";
import { ENVIRONMENTS, buildEnvironment } from "./registry";

describe("every environment", () => {
  for (const entry of ENVIRONMENTS) {
    describe(entry.id, () => {
      const env = buildEnvironment(entry.id);

      it("is well formed: unique ids, finite geometry, valid sky and map window", () => {
        expect(env.id).toBe(entry.id);
        expect(env.solids.length).toBeGreaterThan(20);
        for (const s of env.solids) {
          expect(s.position.every(Number.isFinite)).toBe(true);
          expect(s.size.slice(0, 2).every((v) => Number.isFinite(v) && v > 0)).toBe(true);
        }
        expect(env.outdoor ?? false).toBe(entry.outdoor);
        const r = computeMapRect(env);
        expect(r.maxX).toBeGreaterThan(r.minX);
        expect(r.maxZ).toBeGreaterThan(r.minZ);
      });

      it("has a free spawn point and room above it", () => {
        const [x, y, z] = env.spawn.position;
        expect(pointBlocked(env, [x, y + 0.5, z], 0.3)).toBeNull();
        expect(pointBlocked(env, [x, y + 3, z], 1.5)).toBeNull();
      });

      it("lets a drone take off and hover without crashing", async () => {
        const sim = await Simulation.create({ env, drone: DRONES["fpv-freestyle"], mode: "angle" });
        sim.setInput({ ...NEUTRAL_INPUT, throttle: 0.155 }); // gentle climb: the indoor hall has a 12 m ceiling
        for (let i = 0; i < 360; i++) sim.step(); // 3 s
        expect(sim.crashed).toBe(false);
        expect(sim.getTelemetry().altitude).toBeGreaterThan(1);
        sim.dispose();
      });
    });
  }
});

describe("new maps: missions are flyable by the real autopilot", () => {
  for (const id of ["pine-trail", "turbine-inspection", "harbor-run"]) {
    it(`${id}: all waypoints reached through the real physics with no crash`, async () => {
      const def = MISSIONS.find((m) => m.id === id)!;
      const drone = DRONES[def.droneId];
      const sim = await Simulation.create({ env: buildEnvironment(def.envId), drone, mode: "angle" });
      const ap = new WaypointAutopilot(def.waypoints.map((w) => w.position), drone, { cruise: id === "turbine-inspection" ? 4 : 3.6, radius: Math.max(def.waypoints[0].radius, 1.5) * 0.9 });
      const p = new Vector3();
      const q = new Quaternion();
      const v = new Vector3();
      let t = 0;
      while (!ap.done && t < 400 && !sim.crashed) {
        const b = sim.getBody();
        const tr = b.translation();
        const r = b.rotation();
        const lv = b.linvel();
        p.set(tr.x, tr.y, tr.z);
        q.set(r.x, r.y, r.z, r.w);
        v.set(lv.x, lv.y, lv.z);
        sim.setInput({ ...NEUTRAL_INPUT, ...ap.update(p, q, v) });
        sim.step();
        sim.step();
        t += 2 / 120;
      }
      expect({ reached: ap.index, crashed: sim.crashed }).toEqual({ reached: def.waypoints.length, crashed: false });
      sim.dispose();
    }, 180000);
  }
});
