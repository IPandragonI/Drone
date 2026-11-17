import type { CollisionSeverity, Vec3Tuple } from "@/sim/types";
import type { Difficulty, Medal, MissionDef, MissionResult, MissionStatus, Waypoint } from "./types";

export const POINTS_PER_WAYPOINT = 100;
export const TIME_BONUS_MAX = 300;
export const HEALTH_BONUS_MAX = 200;
export const COLLISION_PENALTY = 25;

/** Time pressure per difficulty: easy gives more time, hard less. Par scales with the limit so the time bonus stays comparable. */
export const DIFFICULTY_TIME_SCALE: Record<Difficulty, number> = { easy: 1.5, normal: 1, hard: 0.8 };

export function scaleMission(def: MissionDef, difficulty: Difficulty): MissionDef {
  const k = DIFFICULTY_TIME_SCALE[difficulty];
  return k === 1 ? def : { ...def, timeLimit: Math.round(def.timeLimit * k), parTime: Math.round(def.parTime * k) };
}

export function maxScore(def: MissionDef): number {
  return def.waypoints.length * POINTS_PER_WAYPOINT + TIME_BONUS_MAX + HEALTH_BONUS_MAX;
}

export function medalFor(def: MissionDef, score: number, completed: boolean): Medal {
  if (!completed) return "none";
  const f = score / maxScore(def);
  return f >= def.medals.gold ? "gold" : f >= def.medals.silver ? "silver" : f >= def.medals.bronze ? "bronze" : "none";
}

/** Pure scoring so it can be tested and re-used by the results screen. */
export function computeScore(def: MissionDef, o: { completed: boolean; reached: number; time: number; health: number; collisions: number }) {
  const waypoints = o.reached * POINTS_PER_WAYPOINT;
  const span = Math.max(1e-6, def.timeLimit - def.parTime);
  const time = o.completed ? Math.round(TIME_BONUS_MAX * Math.min(1, Math.max(0, (def.timeLimit - o.time) / span))) : 0;
  const health = o.completed ? Math.round(HEALTH_BONUS_MAX * Math.min(1, Math.max(0, o.health))) : 0;
  const penalties = Math.min(waypoints + time + health, o.collisions * COLLISION_PENALTY);
  return { score: waypoints + time + health - penalties, breakdown: { waypoints, time, health, penalties } };
}

const dist = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Mission state machine, independent of rendering. The clock starts when the drone first lifts off (`start()`);
 * it is driven by simulation time, so slow frames do not change results.
 */
export class MissionRunner {
  status: MissionStatus = "ready";
  time = 0;
  collisions = 0;
  failReason: "crash" | "time" | undefined;
  private reached = new Set<string>();
  private dwell = 0;
  private dwellTarget: string | null = null;
  private lastSimTime = 0;
  private final: MissionResult | null = null;

  constructor(
    readonly def: MissionDef,
    readonly difficulty: Difficulty = "normal",
  ) {}

  get reachedCount(): number {
    return this.reached.size;
  }

  isReached(id: string): boolean {
    return this.reached.has(id);
  }

  /** Waypoints that can currently be captured. */
  activeTargets(): Waypoint[] {
    const open = this.def.waypoints.filter((w) => !this.reached.has(w.id));
    return this.def.ordered ? open.slice(0, 1) : open;
  }

  /** Begin timing (call once at launch). `simTime` anchors the clock to the simulation. */
  start(simTime: number): void {
    if (this.status !== "ready") return;
    this.status = "running";
    this.lastSimTime = simTime;
  }

  reset(): void {
    this.status = "ready";
    this.time = 0;
    this.collisions = 0;
    this.failReason = undefined;
    this.reached.clear();
    this.dwell = 0;
    this.dwellTarget = null;
    this.final = null;
  }

  onCollision(severity: CollisionSeverity): void {
    if (this.status === "running" && severity !== "none") this.collisions++;
  }

  /** Advance with the drone's current state. Returns true when the status changed. */
  update(simTime: number, position: Vec3Tuple, state: { crashed: boolean; health: number }): boolean {
    if (this.status !== "running") return false;
    const dt = Math.max(0, simTime - this.lastSimTime);
    this.lastSimTime = simTime;
    this.time += dt;

    if (state.crashed) return this.finish(false, "crash", state.health);
    if (this.time > this.def.timeLimit) return this.finish(false, "time", state.health);

    for (const w of this.activeTargets()) {
      if (dist(position, w.position) <= w.radius) {
        if (w.dwell <= 0) {
          this.reached.add(w.id);
          continue;
        }
        if (this.dwellTarget !== w.id) {
          this.dwellTarget = w.id;
          this.dwell = 0;
        }
        this.dwell += dt;
        if (this.dwell >= w.dwell) {
          this.reached.add(w.id);
          this.dwellTarget = null;
          this.dwell = 0;
        }
      } else if (this.dwellTarget === w.id) {
        this.dwellTarget = null; // left the zone: dwell restarts
        this.dwell = 0;
      }
    }
    if (this.reached.size === this.def.waypoints.length) return this.finish(true, undefined, state.health);
    return false;
  }

  /** Progress of the current dwell requirement, 0..1 (for the HUD ring). */
  get dwellProgress(): number {
    const w = this.def.waypoints.find((x) => x.id === this.dwellTarget);
    return w && w.dwell > 0 ? Math.min(1, this.dwell / w.dwell) : 0;
  }

  private finish(completed: boolean, failReason: "crash" | "time" | undefined, health: number): boolean {
    this.status = completed ? "completed" : "failed";
    this.failReason = failReason;
    const { score, breakdown } = computeScore(this.def, { completed, reached: this.reached.size, time: this.time, health, collisions: this.collisions });
    this.final = {
      missionId: this.def.id,
      difficulty: this.difficulty,
      completed,
      failReason,
      time: this.time,
      reached: this.reached.size,
      total: this.def.waypoints.length,
      collisions: this.collisions,
      health,
      score,
      maxScore: maxScore(this.def),
      medal: medalFor(this.def, score, completed),
      at: Date.now(),
      breakdown,
    };
    return true;
  }

  result(): MissionResult | null {
    return this.final;
  }
}
