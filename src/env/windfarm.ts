import { SolidBuilder, seededRandom } from "./builder";
import { distToRouteXZ } from "./scatter";
import type { EnvironmentDef } from "./types";
import type { Vec3Tuple } from "@/sim/types";

/**
 * Desert Wind Farm (BLOCKOUT): open sand with dunes, a row of wind turbines (tower, nacelle, hub and three blades, all collidable),
 * a substation compound and a solar field. Turbine positions are exported for the inspection mission.
 */
export const TURBINE_HUB_HEIGHT = 46;
export const TURBINES: Array<[number, number]> = [
  [-90, -70], [-30, -70], [30, -70], [90, -70],
];
/** Rotor planes face +Z; the inspection waypoints hover 14 m in front of each nacelle. */
export const WINDFARM_ROUTE: Vec3Tuple[] = [
  [0, 6, 38], ...TURBINES.map(([x, z]) => [x, TURBINE_HUB_HEIGHT, z + 14] as Vec3Tuple),
];

export function buildWindFarm(): EnvironmentDef {
  const b = new SolidBuilder();
  const rnd = seededRandom(90210);

  b.box([0, -0.5, -40], [800, 1, 800], "sand");

  // Dunes: low rotated boxes, kept away from the compound and the turbine row.
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 360;
    const z = 60 - rnd() * 320;
    if (Math.abs(x) < 40 && z > 0) continue; // compound
    if (Math.abs(z + 70) < 40) continue; // turbine row
    const w = 18 + rnd() * 40;
    const h = 1.5 + rnd() * 4.5;
    b.box([x, h * 0.3, z], [w, h, w * (0.5 + rnd() * 0.6)], "sand", { rotation: [0, rnd() * 3.1, 0] });
  }

  // Turbines.
  for (const [x, z] of TURBINES) {
    b.drum([x, 0, z], 1.5, TURBINE_HUB_HEIGHT - 1, "turbineWhite");
    b.box([x, TURBINE_HUB_HEIGHT, z], [3.2, 3.2, 8], "turbineWhite");
    b.drum([x, TURBINE_HUB_HEIGHT, z + 4.2], 1.3, 1.6, "steelPainted", { rotation: [Math.PI / 2, 0, 0] });
    for (let k = 0; k < 3; k++) {
      const th = (k * 2 * Math.PI) / 3 + 0.35 + x * 0.002;
      const r = 12.5;
      b.box([x - Math.sin(th) * r, TURBINE_HUB_HEIGHT + Math.cos(th) * r, z + 4.8], [1.5, 24, 0.5], "turbineWhite", { rotation: [0, 0, th] });
    }
    b.box([x, 0.15, z], [8, 0.3, 8], "concrete", { collide: false }); // foundation pad
  }

  // Substation compound with a fence, buildings, transformers and the access road.
  b.box([0, 0.03, 20], [14, 0.04, 140], "asphalt", { collide: false });
  b.box([22, 3, 30], [14, 6, 9], "metalSheet");
  b.box([22, 6.2, 30], [14.6, 0.4, 9.6], "steelPainted");
  b.box([-22, 2.2, 36], [8, 4.4, 6], "concrete");
  for (const [x, z] of [[-22, 24], [-28, 24], [-34, 24]] as const) {
    b.box([x, 1.4, z], [3, 2.8, 2.4], "steelPainted");
    b.pipe([x - 0.8, 2.8, z], [x - 0.8, 4.2, z], 0.2, "pipeGrey", { collide: false });
  }
  for (let x = -40; x <= 40; x += 4) {
    b.box([x, 1.1, 50], [0.1, 2.2, 0.1], "steel", { collide: false });
    b.box([x, 1.1, 8], [0.1, 2.2, 0.1], "steel", { collide: false });
  }
  b.box([0, 1.2, 50], [80, 1.8, 0.03], "grate", { collide: false });

  // Solar field: tilted panel rows on low posts.
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 8; col++) {
      const x = 52 + col * 7;
      const z = 6 + row * 9;
      b.box([x, 1.3, z], [6, 0.12, 3.4], "solar", { rotation: [-0.5, 0, 0] });
      b.box([x, 0.65, z + 0.9], [0.2, 1.3, 0.2], "steel", { collide: false });
    }
  }

  // Met mast near the route end for scale.
  b.drum([-60, 0, -20], 0.25, 30, "steel");

  void distToRouteXZ;
  return {
    id: "desert-wind-farm",
    name: "Desert Wind Farm",
    kind: "freeRoam",
    outdoor: true,
    spawn: { position: [0, 0, 40], yawDeg: 0 },
    solids: b.solids,
    lights: [],
    pois: TURBINES.map(([x, z], i) => ({ id: `poi-turbine-${i + 1}`, name: `Turbine ${i + 1}`, position: [x, TURBINE_HUB_HEIGHT, z + 14] as Vec3Tuple })),
    bounds: { min: [-200, 0, -200], max: [200, 120, 80] },
    mapRect: { minX: -120, maxX: 120, minZ: -100, maxZ: 60 },
    sky: { background: "#9ec9ef", fogColor: "#e1d5bd", fogNear: 120, fogFar: 700 },
  };
}
