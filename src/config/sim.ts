/** Centralised simulation constants. */

export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Max physics substeps per rendered frame (prevents spiral of death on slow frames). */
export const MAX_SUBSTEPS = 10;
export const GRAVITY = 9.81;
/** Armed idle thrust fraction of max per motor. */
export const MOTOR_IDLE_FRACTION = 0.02;

export type CollisionDifficulty = "easy" | "normal" | "hard";

/** Contact velocity-change thresholds in m/s. */
export interface CollisionThresholds {
  minor: number;
  moderate: number;
  severe: number;
  critical: number;
}

export const COLLISION_THRESHOLDS: Record<CollisionDifficulty, CollisionThresholds> = {
  easy: { minor: 1.5, moderate: 4.5, severe: 9, critical: 16 },
  normal: { minor: 1.0, moderate: 3.0, severe: 6.5, critical: 11 },
  hard: { minor: 0.7, moderate: 2.0, severe: 4.5, critical: 8 },
};

/** Minimum time between two registered impacts. */
export const COLLISION_COOLDOWN_S = 0.15;

/** Damage per severity (health 0..1, motor efficiency loss fraction, disturbance angular accel rad/s^2). */
export const DAMAGE_BY_SEVERITY = {
  minor: { health: 0.02, motorLoss: 0, disturbance: 0 },
  moderate: { health: 0.12, motorLoss: 0.1, disturbance: 40 },
  severe: { health: 0.35, motorLoss: 0.35, disturbance: 120 },
  critical: { health: 1, motorLoss: 1, disturbance: 0 },
} as const;
