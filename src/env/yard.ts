import { SolidBuilder } from "./builder";
import type { EnvironmentDef } from "./types";

/**
 * Procedural BLOCKOUT of an open quarry yard (NOT final art): container stacks, fuel tanks, a gantry to fly through,
 * light poles, a tower and rock walls around the edge. Outdoor: weather (wind) applies.
 * Spawn is at the south edge facing north (-Z).
 */
export function buildQuarryYard(): EnvironmentDef {
  const b = new SolidBuilder();

  b.box([0, -0.5, 0], [400, 1, 400], "ground");
  b.box([0, 0.01, 10], [70, 0.02, 40], "concreteDark", { collide: false }); // apron (visual)

  // Gantry crane: two legs and a beam (fly-through gate)
  for (const x of [-12, 12]) b.box([x, 7, -20], [1.2, 14, 1.2], "safetyYellow");
  b.box([0, 14.5, -20], [26, 1.2, 1.4], "safetyYellow");
  b.box([0, 13, -20], [24, 0.3, 0.3], "steel", { collide: false }); // hoist rail (visual)

  // Fuel tanks
  b.drum([20, 0, -10], 4, 6, "steelPainted");
  b.drum([29, 0, -10], 4, 6, "steelPainted");
  b.drum([24.5, 0, -18], 3, 8, "steelPainted");

  // Container stacks (two high), rows with gaps
  const stack = (x: number, z: number, n: number, high: number) => {
    for (let i = 0; i < n; i++)
      for (let h = 0; h < high; h++) b.box([x + i * 6.4, 1.3 + h * 2.6, z], [6, 2.6, 2.4], i % 2 ? "safetyBlue" : "pipeRed");
  };
  stack(-31, -6, 2, 2);
  stack(-31, 8, 2, 1);
  stack(24, 10, 2, 2);
  stack(-8, -36, 3, 2);

  // Light poles
  for (const [x, z] of [[-9, 6], [9, 6], [-9, -8], [9, -8]] as const) b.drum([x, 0, z], 0.18, 12, "steel");

  // Tower
  b.drum([0, 0, -50], 2.2, 26, "steelPainted");
  b.box([0, 26.5, -50], [7, 0.6, 7], "safetyYellow", { collide: false });

  // Rock walls closing the quarry
  b.box([-70, 10, -10], [12, 20, 160], "concreteDark");
  b.box([70, 10, -10], [12, 20, 160], "concreteDark");
  b.box([0, 12, -78], [150, 24, 12], "concreteDark");

  yardDetail(b);

  return {
    id: "quarry-yard",
    name: "Quarry Yard",
    kind: "freeRoam",
    outdoor: true,
    spawn: { position: [0, 0, 22], yawDeg: 0 },
    solids: b.solids,
    lights: [],
    pois: [
      { id: "poi-gantry", name: "Gantry", position: [0, 8, -20] },
      { id: "poi-tower", name: "Tower", position: [6, 12, -50] },
    ],
    bounds: { min: [-100, 0, -90], max: [100, 60, 60] },
    sky: { background: "#8fb8e0", fogColor: "#b7cde0", fogNear: 60, fogFar: 320 },
  };
}

/** Extra yard dressing: shed, barriers, fences, pipe rack, road markings, lamp heads, stock piles. Thin items are visual-only. */
function yardDetail(b: SolidBuilder): void {
  // Road markings on the apron.
  for (let i = 0; i < 9; i++) b.box([0, 0.03, 28 - i * 5], [0.25, 0.02, 2.6], "safetyYellow", { collide: false });
  b.box([-14, 0.03, 12], [0.2, 0.02, 34], "concrete", { collide: false });
  b.box([14, 0.03, 12], [0.2, 0.02, 34], "concrete", { collide: false });

  // Corrugated-steel workshop shed on the east side, with a roller door and roof ribs.
  b.box([44, 3.5, 14], [16, 7, 11], "metalSheet");
  b.box([44, 7.2, 14], [16.6, 0.4, 11.6], "steelPainted");
  b.box([36.05, 2, 14], [0.2, 4, 4.5], "safetyYellow", { collide: false });
  for (let z = 9; z <= 19; z += 2) b.box([44, 7.45, z], [16.8, 0.12, 0.12], "steel", { collide: false });
  for (const x of [38, 44, 50]) b.drum([x, 7.8, 14], 0.3, 0.8, "metalSheet", { collide: false });

  // Jersey barriers around the apron and along the access road.
  for (let i = 0; i < 6; i++) b.box([-22 + i * 2.4, 0.4, 28], [2.2, 0.8, 0.5], "concrete");
  for (let i = 0; i < 6; i++) b.box([22 - i * 2.4, 0.4, 28], [2.2, 0.8, 0.5], "concrete");

  // Chain-link style fence line (visual) with posts.
  for (let x = -60; x <= 60; x += 4) b.box([x, 1.1, 36], [0.08, 2.2, 0.08], "steel", { collide: false });
  b.box([0, 1.2, 36], [120, 1.8, 0.02], "grate", { collide: false });

  // Pipe rack between the tank farm and the gantry: posts, beams and three pipes.
  for (let x = 14; x <= 38; x += 8) {
    b.box([x, 2.2, -28], [0.35, 4.4, 0.35], "steelPainted");
    b.box([x, 4.5, -28], [0.4, 0.3, 2.2], "steelPainted");
  }
  for (const [y, m] of [[3.9, "pipeRed"], [4.3, "pipeGrey"], [4.7, "pipeGrey"]] as const) b.pipe([13, y, -28.6], [39, y, -28.6], 0.16, m, { collide: false });

  // Lamp heads on the light poles, crane hook block under the gantry beam, gravel and sand piles.
  for (const [x, z] of [[-9, 6], [9, 6], [-9, -8], [9, -8]] as const) {
    b.box([x, 12.1, z], [1.4, 0.2, 0.5], "steelPainted", { collide: false });
    b.box([x, 11.95, z], [1.25, 0.04, 0.38], "lamp", { collide: false });
  }
  b.box([0, 11, -20], [0.7, 0.9, 0.5], "safetyYellow", { collide: false });
  b.pipe([0, 13.9, -20], [0, 11.4, -20], 0.03, "steel", { collide: false });
  for (const [x, z, r] of [[-26, 18, 4], [-33, 12, 3]] as const) b.drum([x, 0, z], r, 2.2, "ground", { collide: false });

  // Fuel-tank details: access ladder and walkway rings.
  for (const x of [20, 29]) {
    b.box([x + 4.2, 3, -10], [0.5, 6, 0.1], "steel", { collide: false });
    b.drum([x, 6, -10], 4.1, 0.25, "steelPainted", { collide: false });
  }
}
