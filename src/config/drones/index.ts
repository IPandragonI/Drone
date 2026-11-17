import type { DroneConfig } from "./types";

/*
 * Parameters are plausible estimates per class, not measured hardware data.
 * Thrust-to-weight (TWR) = 4 * maxThrustPerMotorN / (massKg * 9.81).
 */

export const FPV_FREESTYLE: DroneConfig = {
  id: "fpv-freestyle",
  name: "FPV Freestyle 5\"",
  category: "fpv",
  description: "High thrust-to-weight, fast rates. Built for Acro.",
  model: { color: "#222428", accent: "#ff5a1f", ducted: false, propRadiusM: 0.063 },
  physics: {
    massKg: 0.65,
    inertia: [0.0042, 0.0075, 0.0042],
    armLengthM: 0.115,
    maxThrustPerMotorN: 12.5, // TWR ~ 7.8
    yawTorqueRatio: 0.016,
    motorTimeConstantS: 0.035,
    maxTiltDeg: 55,
    maxRatesDegS: { roll: 700, pitch: 700, yaw: 450 },
    rateExpo: 0.35,
    dragLinear: [0.01, 0.02, 0.01],
    dragQuadratic: [0.006, 0.012, 0.0045],
    angularDrag: 0.0004,
    rateGain: 26,
    angleGain: 9,
    throttleExpo: 0,
    colliderHalfExtents: [0.145, 0.035, 0.145],
    friction: 0.7,
    restitution: 0.15,
  },
  battery: { capacityWh: 29, idlePowerW: 20, maxPowerW: 1500, powerExponent: 1.2 },
  camera: {
    fpv: { position: [0, 0.01, -0.07], tiltDeg: 30, fovDeg: 105, vibration: 0.0015 },
    chase: { distance: 1.6, height: 0.55, fovDeg: 75 },
  },
  flightModes: ["acro", "horizon", "angle"],
  defaultMode: "acro",
};

export const INSPECTION: DroneConfig = {
  id: "inspection",
  name: "Inspection Quad",
  category: "inspection",
  description: "Stable and smooth with strong self-leveling. Built for precision.",
  model: { color: "#d8d9dc", accent: "#1d6fff", ducted: false, propRadiusM: 0.12 },
  physics: {
    massKg: 1.6,
    inertia: [0.02, 0.035, 0.02],
    armLengthM: 0.22,
    maxThrustPerMotorN: 8.6, // TWR ~ 2.2
    yawTorqueRatio: 0.02,
    motorTimeConstantS: 0.07,
    maxTiltDeg: 30,
    maxRatesDegS: { roll: 220, pitch: 220, yaw: 120 },
    rateExpo: 0.2,
    dragLinear: [0.08, 0.15, 0.08],
    dragQuadratic: [0.05, 0.09, 0.04],
    angularDrag: 0.004,
    rateGain: 10,
    angleGain: 5,
    throttleExpo: 0,
    colliderHalfExtents: [0.28, 0.07, 0.28],
    friction: 0.8,
    restitution: 0.05,
  },
  battery: { capacityWh: 99, idlePowerW: 25, maxPowerW: 700, powerExponent: 1.4 },
  camera: {
    fpv: { position: [0, 0, -0.14], tiltDeg: 5, fovDeg: 90, vibration: 0.0005 },
    chase: { distance: 2.4, height: 0.9, fovDeg: 65 },
  },
  flightModes: ["angle", "horizon"],
  defaultMode: "angle",
};

export const CINEWHOOP: DroneConfig = {
  id: "cinewhoop",
  name: "Cinewhoop 3\"",
  category: "cinewhoop",
  description: "Compact ducted airframe for tight indoor spaces.",
  model: { color: "#2b2f36", accent: "#27d6a4", ducted: true, propRadiusM: 0.04 },
  physics: {
    massKg: 0.42,
    inertia: [0.0018, 0.0032, 0.0018],
    armLengthM: 0.075,
    maxThrustPerMotorN: 5.2, // TWR ~ 5
    yawTorqueRatio: 0.012,
    motorTimeConstantS: 0.04,
    maxTiltDeg: 42,
    maxRatesDegS: { roll: 420, pitch: 420, yaw: 300 },
    rateExpo: 0.3,
    dragLinear: [0.015, 0.03, 0.015],
    dragQuadratic: [0.01, 0.02, 0.008],
    angularDrag: 0.0003,
    rateGain: 22,
    angleGain: 8,
    throttleExpo: 0,
    colliderHalfExtents: [0.105, 0.04, 0.105],
    friction: 0.6,
    restitution: 0.08,
  },
  battery: { capacityWh: 18, idlePowerW: 12, maxPowerW: 500, powerExponent: 1.2 },
  camera: {
    fpv: { position: [0, 0.01, -0.06], tiltDeg: 12, fovDeg: 110, vibration: 0.0008 },
    chase: { distance: 1.2, height: 0.4, fovDeg: 75 },
  },
  flightModes: ["angle", "horizon", "acro"],
  defaultMode: "angle",
};

export const DRONES: Record<string, DroneConfig> = {
  [FPV_FREESTYLE.id]: FPV_FREESTYLE,
  [INSPECTION.id]: INSPECTION,
  [CINEWHOOP.id]: CINEWHOOP,
};

export const DRONE_LIST: DroneConfig[] = Object.values(DRONES);

export type { DroneConfig } from "./types";
