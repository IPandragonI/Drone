import type { Vec3Tuple } from "@/sim/types";

export type MaterialId =
  | "concrete"
  | "concreteDark"
  | "steel"
  | "steelPainted"
  | "safetyYellow"
  | "safetyBlue"
  | "grate"
  | "metalSheet"
  | "cardboard"
  | "wood"
  | "rubber"
  | "pipeRed"
  | "pipeGrey"
  | "glass"
  | "lamp"
  | "ground"
  | "grass"
  | "foliage"
  | "rock"
  | "sand"
  | "asphalt"
  | "brick"
  | "water"
  | "solar"
  | "turbineWhite";

/**
 * One piece of geometry. Visual and collision representation are independent:
 * `visible: false` gives an invisible collider, `collide: false` a visual-only detail.
 * (A future GLB-backed solid would add an `asset` field; the loader contract is unchanged.)
 */
export interface Solid {
  shape: "box" | "cylinder";
  position: Vec3Tuple;
  /** box: full size [x,y,z]. cylinder: [radius, height, unused] with axis along local Y. */
  size: Vec3Tuple;
  /** Euler XYZ in radians. */
  rotation?: Vec3Tuple;
  material: MaterialId;
  collide?: boolean;
  visible?: boolean;
  tag?: string;
}

export interface PointLightDef {
  position: Vec3Tuple;
  color: string;
  intensity: number;
  distance: number;
}

export interface PointOfInterest {
  id: string;
  name: string;
  position: Vec3Tuple;
}

export interface EnvironmentDef {
  id: string;
  name: string;
  kind: "freeRoam" | "mission";
  /** Open air: weather (wind) applies. Indoor environments are always calm. */
  outdoor?: boolean;
  spawn: { position: Vec3Tuple; yawDeg: number };
  solids: Solid[];
  lights: PointLightDef[];
  pois: PointOfInterest[];
  /** Axis-aligned bounds, used for the minimap and out-of-world detection. */
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  /** Optional minimap window (world X/Z). Defaults to the extent of the structures. */
  mapRect?: { minX: number; maxX: number; minZ: number; maxZ: number };
  sky: { background: string; fogColor: string; fogNear: number; fogFar: number };
}
