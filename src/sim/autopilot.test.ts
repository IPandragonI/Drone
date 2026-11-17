import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { FPV_FREESTYLE } from "@/config/drones";
import { buildEnvironment } from "@/env/registry";
import { segmentBlocked } from "@/missions/validate";
import { WaypointAutopilot } from "./autopilot";
import { Simulation } from "./simulation";
import { NEUTRAL_INPUT, type Telemetry } from "./types";

/** Showcase route through the Industrial Complex: central aisle, round the machinery, over the mezzanine, back to the start. */
export const HERO_ROUTE: Array<[number, number, number]> = [
  [0, 2.6, 5], [0, 3.2, -1], [-1.5, 4.2, -6.5], [-8, 4.4, -7.5], [-15.5, 3.6, -5.5], [-16, 3.2, -0.5],
  [-14, 6.5, 3.5], [-11, 7, 8], [-3, 6, 7.5], [2.5, 4.2, 1.5], [8, 3.6, -1.2], [8.5, 3.2, -6], [2, 3.4, -7.5], [1, 3.2, -2], [0, 3, 6.5],
];

/** Flies a route with the autopilot through the real simulation; optionally records poses for the hero video. */
async function fly(route: Array<[number, number, number]>, cruise: number, record: boolean) {
  const sim = await Simulation.create({ env: buildEnvironment("industrial-complex"), drone: FPV_FREESTYLE, mode: "angle" });
  let hits = 0;
  const hitAt: string[] = [];
  sim.on("collision", (e) => {
    hits++;
    hitAt.push(`${e.severity}@${e.position.map((x) => x.toFixed(1))}`);
  });
  const ap = new WaypointAutopilot(route, FPV_FREESTYLE, { cruise, radius: 1.5 });
  const p = new Vector3();
  const q = new Quaternion();
  const v = new Vector3();
  const tel: Telemetry = { speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0, motors: [0, 0, 0, 0], position: [0, 0, 0] };
  const poses: number[] = [];
  let t = 0;
  while (!ap.done && t < 150 && !sim.crashed) {
    const b = sim.getBody();
    const tr = b.translation();
    const r = b.rotation();
    const lv = b.linvel();
    p.set(tr.x, tr.y, tr.z);
    q.set(r.x, r.y, r.z, r.w);
    v.set(lv.x, lv.y, lv.z);
    const cmd = ap.update(p, q, v);
    sim.setInput({ ...NEUTRAL_INPUT, ...cmd });
    for (let i = 0; i < 2; i++) sim.step();
    t += 2 / 120;
    if (record && Math.round(t * 120) % 4 === 0) {
      sim.getTelemetry(tel);
      poses.push(tr.x, tr.y, tr.z, r.x, r.y, r.z, r.w, ...tel.motors.map((m) => Math.round(m * 1000) / 1000));
    }
  }
  const result = { reached: ap.index, total: route.length, crashed: sim.crashed, health: sim.health, time: t, poses, hits, hitAt };
  sim.dispose();
  return result;
}

describe("waypoint autopilot", () => {
  it("the hero route keeps 0.7 m of clearance from every collider", () => {
    const env = buildEnvironment("industrial-complex");
    let prev: [number, number, number] = [0, 0.8, 9];
    for (const w of HERO_ROUTE) {
      expect(segmentBlocked(env, prev, w, 0.7)).toBeNull();
      prev = w;
    }
  });

  it("flies the hero route through the real physics without a single collision", async () => {
    const r = await fly(HERO_ROUTE, 3.6, process.env.GEN_HERO === "1");
    if (process.env.GEN_HERO === "1" && r.hits === 0) {
      writeFileSync("public/hero-flight.json", JSON.stringify({ drone: "fpv-freestyle", env: "industrial-complex", fps: 30, stride: 11, duration: r.time, poses: r.poses }));
    }
    expect({ reached: r.reached, crashed: r.crashed, hits: r.hits, where: r.hitAt }).toEqual({ reached: r.total, crashed: false, hits: 0, where: [] });
    expect(r.time).toBeLessThan(120);
  }, 120000);
});
