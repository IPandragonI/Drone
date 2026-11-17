import { COLLISION_THRESHOLDS, type CollisionDifficulty } from "@/config/sim";
import type { CollisionSeverity } from "@/sim/types";

/** Classify an impact by contact velocity change (m/s) and the chosen difficulty. */
export function classifyCollision(
  impactSpeed: number,
  difficulty: CollisionDifficulty = "normal",
): CollisionSeverity {
  const t = COLLISION_THRESHOLDS[difficulty];
  if (!Number.isFinite(impactSpeed) || impactSpeed < t.minor) return "none";
  if (impactSpeed < t.moderate) return "minor";
  if (impactSpeed < t.severe) return "moderate";
  if (impactSpeed < t.critical) return "severe";
  return "critical";
}
