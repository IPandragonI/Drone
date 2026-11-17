import { SolidBuilder, seededRandom } from "./builder";
import { distToRouteXZ } from "./scatter";
import type { EnvironmentDef } from "./types";
import type { Vec3Tuple } from "@/sim/types";

/**
 * Pine Valley (BLOCKOUT): a forested valley closed by cliffs, with a river, a timber bridge and a cleared trail.
 * Trees are stacked-cylinder pines (trunk + three canopy tiers); all of them collide. The trail follows FOREST_ROUTE,
 * and no tree or boulder is placed within 6 m (horizontally) of it, so the route is always flyable.
 */
export const FOREST_ROUTE: Vec3Tuple[] = [
  [0, 3.5, 14], [0, 4.5, -10], [8, 4, -34], [-8, 4, -52], [-30, 3.6, -56], [-48, 5.5, -72], [-40, 8, -98], [-12, 7, -112],
];

export function buildPineValley(): EnvironmentDef {
  const b = new SolidBuilder();
  const rnd = seededRandom(5521);

  b.box([0, -0.5, -45], [400, 1, 400], "grass");

  // Cliffs closing the valley (collide) plus a few boulders.
  b.box([-100, 20, -50], [24, 40, 220], "rock");
  b.box([100, 22, -50], [24, 44, 220], "rock");
  b.box([0, 24, -150], [210, 48, 24], "rock");
  b.box([0, 10, 70], [210, 20, 20], "rock");
  for (let i = 0; i < 14; i++) {
    const x = (rnd() - 0.5) * 150;
    const z = 30 - rnd() * 170;
    if (distToRouteXZ(x, z, FOREST_ROUTE) < 9 || Math.hypot(x, z - 28) < 12) continue;
    const s = 2 + rnd() * 4;
    b.box([x, s * 0.4, z], [s * 1.6, s * 0.9, s * 1.3], "rock", { rotation: [0, rnd() * 3, (rnd() - 0.5) * 0.3] });
  }

  // River (visual water over a shallow bed) running north-south at x = -30, with a timber bridge on the trail.
  b.box([-30, 0.04, -45], [9, 0.06, 200], "water", { collide: false });
  b.box([-30, -0.2, -45], [9, 0.3, 200], "rock", { collide: false });
  const bz = -56;
  b.box([-30, 1.2, bz], [14, 0.3, 4], "wood");
  for (const sz of [-1.9, 1.9]) {
    b.box([-30, 1.9, bz + sz], [14, 0.1, 0.12], "wood", { collide: false });
    b.box([-30, 1.55, bz + sz], [14, 0.08, 0.1], "wood", { collide: false });
    for (let k = -3; k <= 3; k++) b.box([-30 + k * 2.1, 1.55, bz + sz], [0.12, 0.8, 0.12], "wood", { collide: false });
  }
  for (const px of [-35, -25]) for (const pz of [bz - 1.5, bz + 1.5]) b.drum([px, -0.4, pz], 0.25, 1.6, "wood");

  // Pines. Rejected near the spawn glade, the trail, the river and the bridge approaches.
  for (let i = 0; i < 520; i++) {
    const x = (rnd() - 0.5) * 180;
    const z = 40 - rnd() * 190;
    if (Math.hypot(x, z - 28) < 11) continue;
    if (distToRouteXZ(x, z, FOREST_ROUTE) < 6.5) continue;
    if (Math.abs(x + 30) < 8) continue;
    const s = 0.75 + rnd() * 0.8;
    b.drum([x, 0, z], 0.32 * s, 5.5 * s, "wood");
    b.drum([x, 3.4 * s, z], 2.5 * s, 3.2 * s, "foliage");
    b.drum([x, 6.0 * s, z], 1.9 * s, 3 * s, "foliage");
    b.drum([x, 8.5 * s, z], 1.2 * s, 2.8 * s, "foliage");
  }

  // Spawn glade: a log cabin to give scale.
  b.box([-9, 1.6, 30], [6, 3.2, 5], "wood");
  b.box([-9, 3.5, 30], [6.8, 0.5, 5.8], "brick");
  b.box([-9, 0.9, 27.45], [1.1, 1.8, 0.1], "steelPainted", { collide: false });

  return {
    id: "pine-valley",
    name: "Pine Valley",
    kind: "freeRoam",
    outdoor: true,
    spawn: { position: [0, 0, 28], yawDeg: 0 },
    solids: b.solids,
    lights: [],
    pois: [
      { id: "poi-bridge", name: "Timber bridge", position: [-30, 3, -56] },
      { id: "poi-cliff", name: "North cliffs", position: [-12, 7, -112] },
    ],
    bounds: { min: [-110, 0, -165], max: [110, 70, 80] },
    mapRect: { minX: -100, maxX: 100, minZ: -145, maxZ: 62 },
    sky: { background: "#9ec3e6", fogColor: "#b8cfe0", fogNear: 40, fogFar: 260 },
  };
}
