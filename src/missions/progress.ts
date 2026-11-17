import type { Medal, MissionResult } from "./types";

export interface BestRecord {
  score: number;
  medal: Medal;
  time: number;
  at: number;
}

export interface FlightStats {
  /** Flights (sessions with a launch). */
  flights: number;
  /** Total airborne seconds. */
  flightTime: number;
  crashes: number;
  collisions: number;
  missionsAttempted: number;
  missionsCompleted: number;
}

export interface Progress {
  version: 1;
  best: Record<string, BestRecord>;
  /** Newest first. */
  history: MissionResult[];
  stats: FlightStats;
}

export const HISTORY_LIMIT = 50;
const MEDAL_RANK: Record<Medal, number> = { none: 0, bronze: 1, silver: 2, gold: 3 };

export const emptyStats = (): FlightStats => ({ flights: 0, flightTime: 0, crashes: 0, collisions: 0, missionsAttempted: 0, missionsCompleted: 0 });
export const emptyProgress = (): Progress => ({ version: 1, best: {}, history: [], stats: emptyStats() });

export function betterMedal(a: Medal, b: Medal): Medal {
  return MEDAL_RANK[a] >= MEDAL_RANK[b] ? a : b;
}

/** Record a finished mission attempt (immutable update). */
export function applyResult(p: Progress, r: MissionResult): Progress {
  const best = { ...p.best };
  const prev = best[r.missionId];
  if (r.completed && (!prev || r.score > prev.score)) best[r.missionId] = { score: r.score, medal: r.medal, time: r.time, at: r.at };
  else if (r.completed && prev && MEDAL_RANK[r.medal] > MEDAL_RANK[prev.medal]) best[r.missionId] = { ...prev, medal: r.medal };
  return {
    ...p,
    best,
    history: [r, ...p.history].slice(0, HISTORY_LIMIT),
    stats: { ...p.stats, missionsAttempted: p.stats.missionsAttempted + 1, missionsCompleted: p.stats.missionsCompleted + (r.completed ? 1 : 0) },
  };
}

/** Add flight totals (immutable update). `flights` is 1 only on the first report of a launched session. */
export function applyFlight(p: Progress, f: { time: number; crashes: number; collisions: number; flights?: number }): Progress {
  const flights = f.flights ?? 0;
  if (f.time <= 0 && f.crashes === 0 && f.collisions === 0 && flights === 0) return p; // nothing happened
  return {
    ...p,
    stats: { ...p.stats, flights: p.stats.flights + flights, flightTime: p.stats.flightTime + f.time, crashes: p.stats.crashes + f.crashes, collisions: p.stats.collisions + f.collisions },
  };
}

const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const MEDALS: Medal[] = ["none", "bronze", "silver", "gold"];

function mergeResult(v: unknown): MissionResult | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.missionId !== "string" || typeof r.completed !== "boolean") return null;
  const b = (typeof r.breakdown === "object" && r.breakdown !== null ? r.breakdown : {}) as Record<string, unknown>;
  return {
    missionId: r.missionId,
    completed: r.completed,
    failReason: r.failReason === "crash" || r.failReason === "time" ? r.failReason : undefined,
    time: n(r.time),
    reached: n(r.reached),
    total: n(r.total),
    collisions: n(r.collisions),
    health: n(r.health),
    score: n(r.score),
    maxScore: n(r.maxScore),
    medal: MEDALS.includes(r.medal as Medal) ? (r.medal as Medal) : "none",
    at: n(r.at),
    breakdown: { waypoints: n(b.waypoints), time: n(b.time), health: n(b.health), penalties: n(b.penalties) },
  };
}

/** Validate stored progress; corrupt entries are dropped, never thrown. */
export function mergeProgress(raw: unknown): Progress {
  const p = emptyProgress();
  if (typeof raw !== "object" || raw === null) return p;
  const o = raw as Record<string, unknown>;
  if (typeof o.best === "object" && o.best !== null) {
    for (const [id, v] of Object.entries(o.best as Record<string, unknown>)) {
      if (typeof v !== "object" || v === null) continue;
      const b = v as Record<string, unknown>;
      p.best[id] = { score: n(b.score), medal: MEDALS.includes(b.medal as Medal) ? (b.medal as Medal) : "none", time: n(b.time), at: n(b.at) };
    }
  }
  if (Array.isArray(o.history)) p.history = o.history.map(mergeResult).filter((r): r is MissionResult => r !== null).slice(0, HISTORY_LIMIT);
  if (typeof o.stats === "object" && o.stats !== null) {
    const s = o.stats as Record<string, unknown>;
    p.stats = { flights: n(s.flights), flightTime: n(s.flightTime), crashes: n(s.crashes), collisions: n(s.collisions), missionsAttempted: n(s.missionsAttempted), missionsCompleted: n(s.missionsCompleted) };
  }
  return p;
}
