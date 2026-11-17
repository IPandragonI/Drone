import type { FlightMode, Vec3Tuple } from "@/sim/types";

export type DroneCategory = "fpv" | "inspection" | "cinewhoop";

/** Pure physical + control parameters. Editing these tunes the drone without touching the engine. */
export interface DronePhysics {
  massKg: number;
  /** Principal moments of inertia [Ixx (pitch), Iyy (yaw), Izz (roll)], kg m^2. */
  inertia: Vec3Tuple;
  /** Motor-to-centre distance, m (X configuration, motors on the diagonals). */
  armLengthM: number;
  maxThrustPerMotorN: number;
  /** Reaction torque per newton of thrust (m). */
  yawTorqueRatio: number;
  /** First-order motor/prop response, s. */
  motorTimeConstantS: number;
  maxTiltDeg: number;
  /** Maximum commanded body rates, deg/s. */
  maxRatesDegS: { roll: number; pitch: number; yaw: number };
  /** Acro stick expo 0..1 (0 linear). */
  rateExpo: number;
  /** Body-frame drag [x,y,z]: F = -(linear*v + quadratic*|v|*v). */
  dragLinear: Vec3Tuple;
  dragQuadratic: Vec3Tuple;
  /** Angular drag N m per rad/s. */
  angularDrag: number;
  /** Rate-loop proportional gain, 1/s (commanded angular acceleration per rad/s of rate error). */
  rateGain: number;
  /** Outer attitude-loop gain, 1/s (Angle/Horizon). */
  angleGain: number;
  /** Throttle expo 0..1 applied to collective thrust. */
  throttleExpo: number;
  /** Collider half extents, m. */
  colliderHalfExtents: Vec3Tuple;
  friction: number;
  restitution: number;
}

export interface DroneBattery {
  capacityWh: number;
  idlePowerW: number;
  maxPowerW: number;
  /** Power ~ (thrust fraction)^exponent. */
  powerExponent: number;
}

export interface DroneCamera {
  fpv: {
    /** Offset from body centre in body frame, m. */
    position: Vec3Tuple;
    /** Upward tilt of the camera, deg. */
    tiltDeg: number;
    fovDeg: number;
    /** Vibration amplitude in metres at full throttle (0 disables). */
    vibration: number;
  };
  chase: { distance: number; height: number; fovDeg: number };
}

export interface DroneConfig {
  id: string;
  name: string;
  category: DroneCategory;
  description: string;
  model: { color: string; accent: string; ducted: boolean; propRadiusM: number };
  physics: DronePhysics;
  battery: DroneBattery;
  camera: DroneCamera;
  flightModes: FlightMode[];
  defaultMode: FlightMode;
}
