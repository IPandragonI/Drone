import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { INSPECTION } from "@/config/drones";
import type { MissionDef } from "@/missions/types";
import { REPLAY_HZ, REPLAY_MAX_SECONDS, FlightRecorder } from "./replay";
import { FlightSession } from "./session";
import { Simulation } from "./simulation";
import { makeTestEnv } from "./testEnv";

describe("FlightRecorder", () => {
  it("samples at a fixed rate, interpolates position and rotation, clamps outside the range", () => {
    const rec = new FlightRecorder();
    const q = new Quaternion();
    for (let i = 0; i <= 60; i++) rec.record(i / 60, new Vector3(i, 0, 0), q.setFromAxisAngle(new Vector3(0, 1, 0), (i / 60) * Math.PI));
    expect(rec.samples).toBeLessThanOrEqual(32); // ~30 Hz, not 60
    expect(rec.duration).toBeGreaterThan(0.9);
    const p = new Vector3();
    const o = new Quaternion();
    rec.sample(0.5, p, o);
    expect(p.x).toBeCloseTo(30, 0); // x = 60 * t
    const yaw = 2 * Math.atan2(o.y, o.w);
    expect(yaw).toBeCloseTo(Math.PI / 2, 1);
    rec.sample(-5, p, o);
    expect(p.x).toBeCloseTo(0);
    rec.sample(99, p, o);
    expect(p.x).toBeGreaterThan(55);
  });

  it("bounds memory", () => {
    const rec = new FlightRecorder();
    const q = new Quaternion();
    const v = new Vector3();
    for (let i = 0; i < (REPLAY_MAX_SECONDS + 60) * REPLAY_HZ; i++) rec.record(i / REPLAY_HZ + 0.0001 * i, v, q);
    expect(rec.samples).toBeLessThanOrEqual(REPLAY_MAX_SECONDS * REPLAY_HZ);
  });
});

const def: MissionDef = {
  id: "t", name: "t", kind: "course", briefing: "", envId: "test", droneId: "inspection", mode: "angle", ordered: true, timeLimit: 60, parTime: 10,
  medals: { gold: 0.85, silver: 0.65, bronze: 0.4 },
  waypoints: [
    { id: "a", label: "A", position: [0, 3, -5], radius: 1.5, dwell: 0 },
    { id: "b", label: "B", position: [0, 3, -10], radius: 1.5, dwell: 0 },
  ],
};

describe("FlightSession missions and replay", () => {
  it("starts the mission clock at launch, captures waypoints from the real tick and reports the result once", async () => {
    const sim = await Simulation.create({ env: makeTestEnv({ wall: false }), drone: INSPECTION, mode: "angle" });
    const session = new FlightSession(sim);
    const ended: string[] = [];
    session.onMissionEnd = (r) => ended.push(r.missionId);
    session.setMission(def);
    session.tick(1 / 60);
    expect(session.mission!.status).toBe("ready"); // not launched yet
    session.keyboard.throttle = 0.5;
    session.tick(1 / 60);
    expect(session.launched).toBe(true);
    expect(session.mission!.status).toBe("running");
    sim.debugTeleport(0, 3, -5);
    session.tick(1 / 60);
    expect(session.mission!.reachedCount).toBe(1);
    sim.debugTeleport(0, 3, -10);
    session.tick(1 / 60);
    expect(session.mission!.status).toBe("completed");
    session.tick(1 / 60);
    expect(ended).toEqual(["t"]);
    expect(session.getViewState().missionStatus).toBe("completed");
    session.dispose();
  });

  it("reset restarts the mission and clears the recording; replay plays back and exits", async () => {
    const sim = await Simulation.create({ env: makeTestEnv({ wall: false }), drone: INSPECTION, mode: "angle" });
    const session = new FlightSession(sim);
    session.setMission(def);
    session.keyboard.throttle = 0.6;
    for (let i = 0; i < 120; i++) session.tick(1 / 60); // 2 s of flight
    expect(session.recorder.duration).toBeGreaterThan(1);
    session.keyboard.setKey("v", true); // replay
    session.keyboard.setKey("v", false);
    session.tick(1 / 60);
    expect(session.replaying).toBe(true);
    expect(session.cameraMode).toBe("chase");
    const before = session.pose.position.y;
    for (let i = 0; i < 30; i++) session.tick(1 / 60);
    expect(session.pose.position.y).not.toBe(before); // pose comes from the recording
    session.keyboard.setKey("v", true);
    session.keyboard.setKey("v", false);
    session.tick(1 / 60);
    expect(session.replaying).toBe(false);
    session.keyboard.setKey("r", true);
    session.keyboard.setKey("r", false);
    session.tick(1 / 60);
    expect(session.mission!.status).toBe("ready");
    expect(session.recorder.samples).toBe(0);
    expect(session.getFlightTotals().time).toBeGreaterThan(0);
    session.dispose();
  });
});
