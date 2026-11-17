import type { FlightMode, Vec3Tuple } from "@/sim/types";
import type { WeatherPreset } from "@/sim/wind";

export type MissionKind = "course" | "inspection" | "exploration";
export type Medal = "gold" | "silver" | "bronze" | "none";

export interface Waypoint {
  id: string;
  label: string;
  position: Vec3Tuple;
  /** Capture radius in metres. */
  radius: number;
  /** Seconds the drone must stay inside the radius (0 = touch is enough). */
  dwell: number;
}

/** Data-driven mission: adding a mission means adding an object, not code. */
export interface MissionDef {
  id: string;
  name: string;
  kind: MissionKind;
  briefing: string;
  envId: string;
  droneId: string;
  mode: FlightMode;
  /** Weather for outdoor environments (ignored indoors). Default calm. */
  weather?: WeatherPreset;
  /** Ordered: waypoints must be taken in sequence. Otherwise any order. */
  ordered: boolean;
  waypoints: Waypoint[];
  /** Seconds. Exceeding it fails the mission. */
  timeLimit: number;
  /** Time at or below which the full time bonus is earned. */
  parTime: number;
  /** Score fractions (of the maximum) for medals; completion is required for any medal. */
  medals: { gold: number; silver: number; bronze: number };
}

export type MissionStatus = "ready" | "running" | "completed" | "failed";

export interface MissionResult {
  missionId: string;
  completed: boolean;
  failReason?: "crash" | "time";
  time: number;
  reached: number;
  total: number;
  collisions: number;
  health: number;
  score: number;
  maxScore: number;
  medal: Medal;
  /** Epoch ms when the attempt ended. */
  at: number;
  breakdown: { waypoints: number; time: number; health: number; penalties: number };
}
