import type { EnvironmentDef } from "@/env/types";

/** Minimal flat-ground environment with one wall, used by tests. */
export function makeTestEnv(opts: { wall?: boolean } = {}): EnvironmentDef {
  const wall = opts.wall ?? true;
  return {
    id: "test",
    name: "Test",
    kind: "mission",
    spawn: { position: [0, 0, 0], yawDeg: 0 },
    solids: [
      { shape: "box", position: [0, -0.5, 0], size: [400, 1, 400], material: "ground" },
      // wall 20 m in front of spawn (forward = -Z)
      ...(wall ? [{ shape: "box" as const, position: [0, 25, -20] as [number, number, number], size: [60, 50, 1] as [number, number, number], material: "concrete" as const }] : []),
    ],
    lights: [],
    pois: [],
    bounds: { min: [-200, 0, -200], max: [200, 50, 200] },
    sky: { background: "#000", fogColor: "#000", fogNear: 10, fogFar: 100 },
  };
}
