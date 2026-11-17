import { describe, expect, it } from "vitest";
import { buildEnvironment } from "@/env/registry";
import { MISSIONS } from "./defs";
import { COLLISION_PENALTY, HEALTH_BONUS_MAX, MissionRunner, POINTS_PER_WAYPOINT, TIME_BONUS_MAX, maxScore, medalFor } from "./runner";
import { validateMission } from "./validate";
import { HISTORY_LIMIT, applyFlight, applyResult, emptyProgress, mergeProgress } from "./progress";
import type { MissionResult } from "./types";


describe("built-in missions", () => {
  for (const def of MISSIONS) {
    it(`${def.id}: waypoints are in free space and the route is flyable`, () => {
      expect(validateMission(def, buildEnvironment(def.envId))).toEqual([]);
    });
  }
  it("have unique ids", () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
  });
});

const sample = MISSIONS[0];
const at = (i: number) => sample.waypoints[i].position;
const ok = { crashed: false, health: 1 };

describe("MissionRunner", () => {
  it("does not run or time before start()", () => {
    const r = new MissionRunner(sample);
    expect(r.update(5, at(0), ok)).toBe(false);
    expect(r.time).toBe(0);
    expect(r.status).toBe("ready");
  });

  it("ordered missions only capture the next waypoint", () => {
    const r = new MissionRunner(sample);
    r.start(0);
    r.update(1, at(3), ok); // wrong gate first
    expect(r.reachedCount).toBe(0);
    r.update(2, at(0), ok);
    expect(r.reachedCount).toBe(1);
    expect(r.activeTargets()[0].id).toBe("g2");
  });

  it("unordered missions accept any order", () => {
    const def = MISSIONS.find((m) => !m.ordered)!;
    const r = new MissionRunner(def);
    r.start(0);
    r.update(1, def.waypoints[3].position, ok);
    r.update(2, def.waypoints[0].position, ok);
    expect(r.reachedCount).toBe(2);
    expect(r.activeTargets()).toHaveLength(3);
  });

  it("dwell requires continuous time inside and restarts when leaving", () => {
    const def = MISSIONS.find((m) => m.kind === "inspection")!;
    const r = new MissionRunner(def);
    r.start(0);
    const p = def.waypoints[0].position;
    r.update(0.5, p, ok);
    r.update(1.0, p, ok);
    expect(r.reachedCount).toBe(0);
    expect(r.dwellProgress).toBeGreaterThan(0.3);
    r.update(1.1, [p[0] + 20, p[1], p[2]], ok); // left
    expect(r.dwellProgress).toBe(0);
    r.update(1.2, p, ok);
    r.update(2.0, p, ok);
    expect(r.reachedCount).toBe(0); // only ~0.8 s since re-entry
    r.update(3.0, p, ok);
    expect(r.reachedCount).toBe(1);
  });

  it("completes, scores time/health bonuses, subtracts collision penalties", () => {
    const r = new MissionRunner(sample);
    r.start(0);
    let t = 0;
    for (let i = 0; i < sample.waypoints.length; i++) {
      t += sample.parTime / sample.waypoints.length; // finish exactly at par
      r.update(t, at(i), { crashed: false, health: 0.8 });
    }
    expect(r.status).toBe("completed");
    r.onCollision("none");
    const res = r.result()!;
    expect(res.completed).toBe(true);
    expect(res.breakdown.waypoints).toBe(sample.waypoints.length * POINTS_PER_WAYPOINT);
    expect(res.breakdown.time).toBe(TIME_BONUS_MAX);
    expect(res.breakdown.health).toBe(Math.round(HEALTH_BONUS_MAX * 0.8));
    expect(res.score).toBe(res.breakdown.waypoints + res.breakdown.time + res.breakdown.health);
    expect(res.maxScore).toBe(maxScore(sample));
    expect(res.medal).toBe("gold");
  });

  it("collisions during the run cost points and can drop the medal", () => {
    const r = new MissionRunner(sample);
    r.start(0);
    for (let i = 0; i < 10; i++) r.onCollision("moderate");
    let t = 0;
    for (let i = 0; i < sample.waypoints.length; i++) {
      t += 10;
      r.update(t, at(i), ok);
    }
    const res = r.result()!;
    expect(res.collisions).toBe(10);
    expect(res.breakdown.penalties).toBe(10 * COLLISION_PENALTY);
    expect(res.medal).not.toBe("gold");
  });

  it("fails on crash (no bonuses, no medal) and on time limit", () => {
    const a = new MissionRunner(sample);
    a.start(0);
    a.update(1, at(0), ok);
    a.update(2, at(0), { crashed: true, health: 0 });
    expect(a.status).toBe("failed");
    expect(a.failReason).toBe("crash");
    expect(a.result()).toMatchObject({ completed: false, medal: "none", score: POINTS_PER_WAYPOINT });
    const b = new MissionRunner(sample);
    b.start(0);
    b.update(sample.timeLimit + 1, at(0), ok);
    expect(b.failReason).toBe("time");
    expect(b.result()!.medal).toBe("none");
  });

  it("reset returns to ready and allows another attempt", () => {
    const r = new MissionRunner(sample);
    r.start(0);
    r.update(1, at(0), { crashed: true, health: 0 });
    r.reset();
    expect(r.status).toBe("ready");
    expect(r.result()).toBeNull();
    r.start(10);
    r.update(11, at(0), ok);
    expect(r.reachedCount).toBe(1);
  });

  it("medal thresholds", () => {
    expect(medalFor(sample, maxScore(sample) * 0.9, true)).toBe("gold");
    expect(medalFor(sample, maxScore(sample) * 0.7, true)).toBe("silver");
    expect(medalFor(sample, maxScore(sample) * 0.45, true)).toBe("bronze");
    expect(medalFor(sample, maxScore(sample) * 0.2, true)).toBe("none");
    expect(medalFor(sample, maxScore(sample), false)).toBe("none");
  });
});

const res = (over: Partial<MissionResult> = {}): MissionResult => ({
  missionId: "hall-slalom", completed: true, time: 40, reached: 8, total: 8, collisions: 0, health: 1, score: 900, maxScore: 1300,
  medal: "silver", at: 1, breakdown: { waypoints: 800, time: 100, health: 0, penalties: 0 }, ...over,
});

describe("progress", () => {
  it("keeps the best completed score and the best medal; failures never replace it", () => {
    let p = applyResult(emptyProgress(), res({ score: 900, medal: "silver" }));
    p = applyResult(p, res({ score: 700, medal: "bronze" }));
    expect(p.best["hall-slalom"].score).toBe(900);
    p = applyResult(p, res({ completed: false, score: 5000, medal: "none" }));
    expect(p.best["hall-slalom"].score).toBe(900);
    p = applyResult(p, res({ score: 1200, medal: "gold" }));
    expect(p.best["hall-slalom"]).toMatchObject({ score: 1200, medal: "gold" });
    expect(p.stats).toMatchObject({ missionsAttempted: 4, missionsCompleted: 3 });
    expect(p.history[0].score).toBe(1200); // newest first
  });

  it("caps history and ignores flights that never launched", () => {
    let p = emptyProgress();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) p = applyResult(p, res({ at: i }));
    expect(p.history).toHaveLength(HISTORY_LIMIT);
    expect(applyFlight(p, { time: 0, crashes: 0, collisions: 0 })).toBe(p);
    const q = applyFlight(p, { time: 30, crashes: 1, collisions: 4, flights: 1 });
    expect(applyFlight(q, { time: 10, crashes: 0, collisions: 0 }).stats.flights).toBe(1); // periodic flush: no extra flight
    expect(q.stats).toMatchObject({ flights: 1, flightTime: 30, crashes: 1, collisions: 4 });
  });

  it("merges corrupt stored data without throwing", () => {
    expect(mergeProgress(null)).toEqual(emptyProgress());
    expect(mergeProgress("x")).toEqual(emptyProgress());
    const m = mergeProgress({ best: { a: { score: -5, medal: "platinum" }, b: 3 }, history: [1, { missionId: "x" }, res()], stats: { flights: "many", crashes: 2 } });
    expect(m.best.a).toMatchObject({ score: 0, medal: "none" });
    expect(m.best.b).toBeUndefined();
    expect(m.history).toHaveLength(1);
    expect(m.stats).toMatchObject({ flights: 0, crashes: 2 });
  });
});
