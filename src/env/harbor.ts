import { SolidBuilder, seededRandom } from "./builder";
import type { EnvironmentDef, MaterialId } from "./types";
import type { Vec3Tuple } from "@/sim/types";

/**
 * Harbor District (BLOCKOUT): quay with container stacks (an 8 m aisle between the two blocks), a brick warehouse,
 * two quay cranes, a moored ship and open water to the east. Water is visual only; the sea bed collides.
 */
export const HARBOR_ROUTE: Vec3Tuple[] = [
  [-32, 4.5, 30], [-32, 5, -12], [-32, 6, -50], [-32, 13, -54], [-8, 13, -36], [-6, 11, -30], [10, 11, -30], [32, 24, -22],
  [48, 14, -10], [48, 8, 45], [10, 5, 42], [-30, 4, 36],
];

const COLORS: MaterialId[] = ["pipeRed", "safetyBlue", "safetyYellow", "steelPainted", "pipeGrey", "cardboard"];

export function buildHarbor(): EnvironmentDef {
  const b = new SolidBuilder();
  const rnd = seededRandom(31337);

  // Quay (asphalt), sea bed and sea.
  b.box([-30, -0.5, -15], [110, 1, 200], "asphalt");
  b.box([60, -6, -15], [140, 1, 260], "rock"); // sea bed (collides)
  b.box([60, -0.25, -15], [140, 0.1, 260], "water", { collide: false });
  b.box([11, -1.4, -15], [2, 2.6, 200], "concrete"); // quay wall
  for (let z = -100; z <= 70; z += 10) b.drum([9.3, 0, z], 0.28, 0.7, "steel", { collide: false }); // bollards

  // Container blocks: x in [-50,-36] and [-28,-14] leave an 8 m aisle at x = -32.
  const block = (x0: number, rows: number, z0: number, z1: number) => {
    for (let z = z0; z <= z1; z += 2.9) {
      for (let c = 0; c < rows; c++) {
        const h = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < h; k++) b.box([x0 + c * 2.6, 1.3 + k * 2.6, z], [2.4, 2.6, 6], COLORS[Math.floor(rnd() * COLORS.length)]);
      }
    }
  };
  block(-49, 5, -60, 10);
  block(-27, 5, -60, 10);

  // Warehouse (brick) at the back of the quay, with a roller door and roof ribs.
  b.box([-62, 5, -10], [12, 10, 60], "brick");
  b.box([-62, 10.3, -10], [12.8, 0.6, 60.8], "steelPainted");
  for (const z of [-30, -10, 10]) b.box([-55.9, 2.2, z], [0.2, 4.4, 5], "metalSheet", { collide: false });

  // Moored ship: hull, deck house, funnel, masts.
  b.box([34, 3.5, -12], [14, 7, 90], "steelPainted");
  b.box([34, 8.5, -50], [10, 6, 10], "turbineWhite");
  b.box([34, 12.5, -50], [8, 3, 8], "turbineWhite");
  b.drum([34, 15, -46], 1.6, 5, "pipeRed");
  for (const z of [-20, 0, 20]) b.box([34, 8, z], [9, 2, 6], COLORS[Math.floor(rnd() * 3)]);
  b.drum([34, 7, 24], 0.2, 16, "steel");

  // Two quay cranes: portal legs, cross beams, boom reaching over the ship.
  for (const cz of [-30, 14]) {
    for (const [lx, lz] of [[5.5, cz - 4], [5.5, cz + 4], [14, cz - 4], [14, cz + 4]] as const) b.box([lx, 13, lz], [1.2, 26, 1.2], "safetyYellow");
    b.box([9.75, 25, cz - 4], [10.4, 1.4, 1.2], "safetyYellow");
    b.box([9.75, 25, cz + 4], [10.4, 1.4, 1.2], "safetyYellow");
    b.box([22, 28, cz], [36, 1.6, 2.2], "safetyYellow");
    b.box([9.75, 27, cz], [10.4, 3, 9.5], "steelPainted");
    b.pipe([5.5, 29, cz], [-4, 29, cz], 0.2, "steel", { collide: false });
  }

  // Light masts and rail tracks (visual).
  for (const [x, z] of [[-4, 54], [-4, 0], [-4, -40], [-4, -80]] as const) {
    b.drum([x, 0, z], 0.2, 14, "steel");
    b.box([x, 14.1, z], [1.6, 0.25, 0.5], "steelPainted", { collide: false });
    b.box([x, 13.95, z], [1.4, 0.04, 0.4], "lamp", { collide: false });
  }
  for (const x of [-1, 0.4]) b.box([x + 1.5, 0.03, -15], [0.15, 0.04, 190], "steel", { collide: false });
  b.box([-30, 0.03, 40], [60, 0.04, 0.3], "safetyYellow", { collide: false });

  return {
    id: "harbor-district",
    name: "Harbor District",
    kind: "freeRoam",
    outdoor: true,
    spawn: { position: [-32, 0, 44], yawDeg: 0 },
    solids: b.solids,
    lights: [],
    pois: [
      { id: "poi-crane", name: "Quay crane", position: [10, 10, -30] },
      { id: "poi-ship", name: "Cargo ship", position: [34, 14, -10] },
    ],
    bounds: { min: [-80, -8, -130], max: [130, 90, 70] },
    mapRect: { minX: -70, maxX: 100, minZ: -110, maxZ: 60 },
    sky: { background: "#a9c8e4", fogColor: "#c9d6e0", fogNear: 80, fogFar: 520 },
  };
}
