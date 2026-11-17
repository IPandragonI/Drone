import { SolidBuilder, seededRandom } from "./builder";
import { addIndustrialDetail } from "./industrialDetail";
import type { EnvironmentDef, PointLightDef } from "./types";
import type { Vec3Tuple } from "@/sim/types";

/**
 * Procedural BLOCKOUT of a modular industrial complex (NOT final art; every piece is a primitive).
 * Layout (top view, X right, Z toward viewer; forward at spawn = -Z):
 *
 *   z=-14 +-------------------------------+
 *         |  catwalk     |   WORKSHOP      |  x in [12,24], z in [-14,-3], ceiling 5.5 m
 *         |  pipes       +------+  corridor|
 *         |       cross-bridge (x=6)        |
 *         |   machinery  |   central aisle  |
 *   z=+4  | MEZZANINE (y=4.5) over STORAGE  |
 *   z=14  +---------- roller door ---------+
 *         x=-24                          x=24
 */
const W = 24; // half-length in X
const D = 14; // half-depth in Z
const H = 12; // hall height
const T = 0.4; // wall thickness

export function buildIndustrialComplex(): EnvironmentDef {
  const b = new SolidBuilder();
  const rnd = seededRandom(20240607);

  yardAndShell(b);
  steelStructure(b);
  workshop(b, rnd);
  storageAndMezzanine(b, rnd);
  walkways(b);
  pipesAndElectrical(b);
  machinery(b);
  addIndustrialDetail(b, seededRandom(77031));

  const lights: PointLightDef[] = [];
  for (const x of [-15, 0, 15]) for (const z of [-6, 7]) lights.push({ position: [x, H - 1.5, z], color: "#ffe9c8", intensity: 260, distance: 30 });
  lights.push({ position: [18, 4.3, -8.5], color: "#fff1dc", intensity: 60, distance: 14 }); // workshop
  lights.push({ position: [-15, 3.4, 9], color: "#ffe2b8", intensity: 40, distance: 12 }); // under mezzanine

  return {
    id: "industrial-complex",
    name: "Industrial Complex",
    kind: "freeRoam",
    spawn: { position: [0, 0, 9], yawDeg: 0 },
    solids: b.solids,
    lights,
    pois: [
      { id: "poi-workshop", name: "Workshop", position: [18, 1.5, -8] },
      { id: "poi-mezz", name: "Mezzanine", position: [-15, 5.5, 9] },
      { id: "poi-crane", name: "Overhead crane", position: [-8, 8.5, 0] },
      { id: "poi-tanks", name: "Process tanks", position: [-4.5, 3, 9] },
      { id: "poi-yard", name: "Container yard", position: [-10, 3, 24] },
    ],
    bounds: { min: [-60, 0, -40], max: [60, 30, 60] },
    mapRect: { minX: -26, maxX: 26, minZ: -16, maxZ: 16 }, // the hall; the yard outside is not mapped
    sky: { background: "#9fb4c4", fogColor: "#8c9aa5", fogNear: 25, fogFar: 140 },
  };
}

function yardAndShell(b: SolidBuilder): void {
  b.box([0, -0.5, 0], [300, 1, 300], "ground");
  b.box([0, 0.01, 0], [2 * W, 0.02, 2 * D], "concreteDark", { collide: false }); // slab (visual)

  const windowsNS: Array<[number, number, number, number]> = [
    [-20, -14, 7, 10],
    [-8, -2, 7, 10],
    [2, 8, 7, 10],
    [14, 20, 7, 10],
  ];
  // north (z=-D) and south (z=+D) walls along X
  b.wall("x", -D, -W, W, 0, H, T, "concrete", windowsNS);
  b.wall("x", D, -W, W, 0, H, T, "concrete", [[-4, 4, 0, 5.2], [-20, -12, 7, 10], [10, 20, 7, 10]]);
  // west (x=-W) and east (x=+W) walls along Z
  b.wall("z", -W, -D, D, 0, H, T, "concrete", [[-1, 1.2, 0, 2.4], [-10, -4, 7, 10], [4, 10, 7, 10]]);
  b.wall("z", W, -D, D, 0, H, T, "concrete", [[3, 7, 0, 4], [8, 12, 7, 10]]);

  // glazing in windows (collidable glass)
  for (const [x0, x1, y0, y1] of windowsNS) {
    b.boxMinMax([x0, y0, -D - 0.03], [x1, y1, -D + 0.03], "glass");
  }
  b.boxMinMax([-20, 7, D - 0.03], [-12, 10, D + 0.03], "glass");
  b.boxMinMax([10, 7, D - 0.03], [20, 10, D + 0.03], "glass");
  b.boxMinMax([-W - 0.03, 7, -10], [-W + 0.03, 10, -4], "glass");
  b.boxMinMax([-W - 0.03, 7, 4], [-W + 0.03, 10, 10], "glass");
  b.boxMinMax([W - 0.03, 7, 8], [W + 0.03, 10, 12], "glass");

  // roller door frame + door-stop marking
  b.box([-4.15, 2.7, D], [0.3, 5.4, 0.6], "safetyYellow");
  b.box([4.15, 2.7, D], [0.3, 5.4, 0.6], "safetyYellow");
  b.box([0, 5.35, D], [8.6, 0.3, 0.6], "safetyYellow");

  // roof with skylight strips
  const roofStrips: Array<[number, number]> = [[-D, -9], [-7, -1.5], [1.5, 7], [9, D]];
  for (const [z0, z1] of roofStrips) b.boxMinMax([-W, H, z0], [W, H + 0.3, z1], "metalSheet");
  for (const [z0, z1] of [[-9, -7], [-1.5, 1.5], [7, 9]] as Array<[number, number]>) {
    b.boxMinMax([-W, H + 0.1, z0], [W, H + 0.2, z1], "glass");
  }
  // floor markings (visual only)
  for (const x of [-3.2, 3.2]) b.box([x, 0.03, 0], [0.15, 0.01, 2 * D - 1], "safetyYellow", { collide: false });

  // container yard south of the roller door
  b.box([-14, 1.3, 24], [6.1, 2.6, 2.4], "safetyBlue");
  b.box([-14, 3.9, 24], [6.1, 2.6, 2.4], "steelPainted");
  b.box([-6.5, 1.3, 22], [6.1, 2.6, 2.4], "pipeRed");
  b.box([8, 1.3, 26], [6.1, 2.6, 2.4], "steelPainted");
}

function steelStructure(b: SolidBuilder): void {
  const colsX = [-20, -12, -4, 4, 12, 20];
  for (const x of colsX) {
    for (const z of [-10, 10]) {
      if (x >= 12 && z === -10) continue; // workshop footprint
      b.box([x, H / 2, z], [0.5, H, 0.5], "steelPainted");
      b.box([x, 0.15, z], [0.9, 0.3, 0.9], "concrete"); // footing
    }
    // roof truss: top chord, bottom chord, web posts
    b.box([x, H - 0.3, 0], [0.3, 0.5, 2 * D - 0.6], "steelPainted");
    b.box([x, H - 2.6, 0], [0.25, 0.3, 2 * D - 0.6], "steelPainted");
    for (let z = -12; z <= 12; z += 4) b.box([x, H - 1.45, z], [0.18, 2.2, 0.18], "steelPainted");
  }
  // purlins
  for (const z of [-12, -6, 0, 6, 12]) b.box([0, H - 0.5, z], [2 * W, 0.25, 0.25], "steel");
  // crane runway beams and a bridge crane
  for (const z of [-8, 8]) b.box([0, 9.2, z], [2 * W - 1, 0.45, 0.45], "safetyYellow");
  b.box([-8, 8.9, 0], [0.6, 0.6, 16.4], "safetyYellow");
  b.box([-8, 7.8, 1.5], [0.3, 1.6, 0.3], "steel", { tag: "crane-hoist" });
  b.box([-8, 6.9, 1.5], [0.7, 0.6, 0.5], "safetyYellow");
  // hanging lamps (emissive)
  for (const x of [-16, -8, 0, 8, 16]) {
    for (const z of [-8, 0, 8]) b.box([x, H - 3.2, z], [1.4, 0.16, 0.4], "lamp");
  }
}

function crate(b: SolidBuilder, x: number, y: number, z: number, s: Vec3Tuple, mat: "cardboard" | "wood" = "cardboard"): void {
  b.box([x, y + s[1] / 2, z], s, mat);
}

function pallet(b: SolidBuilder, x: number, z: number, rnd: () => number, stack = true): void {
  b.box([x, 0.07, z], [1.2, 0.14, 0.8], "wood");
  if (stack) {
    const h = 0.5 + rnd() * 1.1;
    b.box([x, 0.14 + h / 2, z], [1.1, h, 0.75], rnd() > 0.35 ? "cardboard" : "safetyBlue");
  }
}

function workshop(b: SolidBuilder, rnd: () => number): void {
  const x0 = 12;
  const x1 = W;
  const z0 = -D;
  const z1 = -3;
  const hh = 5.5;
  b.wall("x", z1, x0, x1, 0, hh, 0.3, "concrete", [[15, 17.2, 0, 2.4]]); // south wall with door
  b.wall("z", x0, z0, z1, 0, hh, 0.3, "concrete", [[-9.5, -6.5, 0, 3.2]]); // west wall with wide opening
  b.boxMinMax([x0, hh, z0], [x1, hh + 0.25, z1], "metalSheet"); // ceiling slab (flyable top at 5.75)
  // narrow corridor: partition leaving a ~1.7 m wide lane along the east wall
  b.wall("z", 22, -13.2, -5.2, 0, hh, 0.2, "concrete");
  // door frame
  b.box([14.9, 1.2, z1], [0.15, 2.4, 0.4], "safetyYellow");
  b.box([17.3, 1.2, z1], [0.15, 2.4, 0.4], "safetyYellow");
  // benches and tools along north wall
  for (const x of [14.5, 17.5, 20.5]) {
    b.box([x, 0.45, -13.3], [2.4, 0.9, 0.8], "steelPainted");
    b.box([x, 0.92, -13.3], [2.5, 0.06, 0.9], "wood");
    b.box([x, 2.2, -13.85], [2.2, 0.9, 0.2], "steel"); // tool panel
  }
  // lathe / mill
  b.box([14, 0.6, -9.5], [2.6, 1.2, 1.0], "safetyBlue");
  b.box([14, 1.45, -9.7], [1.2, 0.5, 0.7], "steel");
  b.box([18.5, 1.1, -8], [1.8, 2.2, 1.6], "steelPainted");
  b.box([18.5, 2.35, -8], [0.9, 0.3, 0.9], "lamp", { collide: false });
  // electrical cabinets on west partition side
  for (let i = 0; i < 4; i++) b.box([12.45, 1.05, -12.5 + i * 0.95], [0.5, 2.1, 0.9], i % 2 ? "steelPainted" : "steel");
  // drums and pallets
  for (let i = 0; i < 4; i++) b.drum([14 + (i % 2) * 0.8, 0, -5 - Math.floor(i / 2) * 0.8], 0.29, 0.9, i % 2 ? "safetyBlue" : "pipeRed");
  pallet(b, 20.5, -4.6, rnd);
  // ceiling duct
  b.pipe([12.5, 5.0, -4], [23.5, 5.0, -4], 0.3, "metalSheet");
  // corridor obstacles (cables, a hanging beam)
  b.box([22.95, 1.9, -9], [1.5, 0.12, 0.12], "rubber");
  b.box([22.95, 0.5, -11], [1.2, 1.0, 0.5], "cardboard");
}

function rack(b: SolidBuilder, rnd: () => number, x0: number, x1: number, z: number): void {
  const levels = [0.25, 1.6, 2.95];
  for (let x = x0; x <= x1 + 0.01; x += 2.4) {
    b.box([x, 1.95, z - 0.4], [0.1, 3.9, 0.08], "safetyBlue");
    b.box([x, 1.95, z + 0.4], [0.1, 3.9, 0.08], "safetyBlue");
  }
  for (const y of levels) {
    b.boxMinMax([x0 - 0.05, y, z - 0.45], [x1 + 0.05, y + 0.1, z - 0.4 + 0.05], "pipeRed", { collide: false });
    b.box([(x0 + x1) / 2, y + 0.05, z], [x1 - x0 + 0.1, 0.1, 0.9], "steelPainted");
    for (let x = x0 + 0.7; x < x1 - 0.4; x += 1.25) {
      if (rnd() < 0.2) continue;
      const hgt = 0.5 + rnd() * 0.7;
      crate(b, x, y + 0.1, z + (rnd() - 0.5) * 0.1, [0.9 + rnd() * 0.2, hgt, 0.7], rnd() > 0.5 ? "cardboard" : "wood");
    }
  }
}

function storageAndMezzanine(b: SolidBuilder, rnd: () => number): void {
  // racks under the mezzanine
  for (const z of [6, 9.2, 12.4]) rack(b, rnd, -22.6, -8.6, z);
  // loose pallets
  for (let i = 0; i < 6; i++) pallet(b, -7.2 + (i % 2) * 1.5, 6.2 + Math.floor(i / 2) * 2.6, rnd);
  pallet(b, 20.5, 6, rnd);
  pallet(b, 20.5, 7.2, rnd);

  // mezzanine deck and supports
  const y = 4.5;
  b.boxMinMax([-W + 0.2, y - 0.25, 4], [-6, y, D - 0.2], "grate");
  for (const [x, z] of [[-6.2, 4.2], [-6.2, 13.7], [-15, 4.2], [-15, 13.7], [-23.5, 4.2]] as Array<[number, number]>) {
    b.box([x, (y - 0.25) / 2, z], [0.3, y - 0.25, 0.3], "steelPainted");
  }
  b.boxMinMax([-W + 0.2, y - 0.6, 3.9], [-6, y - 0.25, 4.1], "steelPainted"); // front beam
  // railings (edge z=4 with stair gap, edge x=-6)
  const rails: Array<[Vec3Tuple, Vec3Tuple]> = [
    [[-W + 0.3, y, 4.05], [-9.7, y, 4.05]],
    [[-7.7, y, 4.05], [-6.05, y, 4.05]],
    [[-6.05, y, 4.05], [-6.05, y, D - 0.25]],
  ];
  for (const [a, c] of rails) railing(b, a, c);
  // mezzanine equipment
  b.box([-20, y + 0.6, 12.4], [1.6, 1.2, 1.2], "steelPainted");
  b.box([-17, y + 1.0, 13.3], [0.9, 2.0, 0.6], "steel");
  crate(b, -12, y, 11, [1.2, 0.9, 1], "wood");
  crate(b, -11, y, 7, [0.9, 0.6, 0.9], "cardboard");

  // stairs up to the mezzanine: 18 steps, 0.25 rise, 0.278 run, ascending +Z, x in [-9.6, -8]
  const steps = 18;
  const run = 5 / steps;
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * 0.25;
    b.boxMinMax([-9.6, 0, -1 + i * run], [-8, top, -1 + (i + 1) * run], "grate");
  }
  const len = Math.hypot(5, 4.5);
  const ang = -Math.atan2(4.5, 5);
  for (const x of [-9.65, -7.95]) {
    b.box([x, 2.25 + 1.0, 1.5], [0.05, 0.05, len], "steelPainted", { rotation: [ang, 0, 0] });
    b.box([x, 2.25 + 0.5, 1.5], [0.04, 0.04, len], "steelPainted", { rotation: [ang, 0, 0] });
    for (let i = 0; i <= 5; i++) b.box([x, (i / 5) * 4.5 + 0.5, -1 + (i / 5) * 5], [0.05, 1.0, 0.05], "steelPainted");
  }
}

function railing(b: SolidBuilder, a: Vec3Tuple, c: Vec3Tuple): void {
  const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.box([a[0] + (c[0] - a[0]) * t, a[1] + 0.5, a[2] + (c[2] - a[2]) * t], [0.06, 1.0, 0.06], "safetyYellow");
  }
  for (const h of [0.5, 1.0]) b.pipe([a[0], a[1] + h, a[2]], [c[0], c[1] + h, c[2]], 0.025, "safetyYellow");
}

function walkways(b: SolidBuilder): void {
  // wall catwalk along the south wall, y = 6
  const y = 6;
  b.boxMinMax([-6, y - 0.1, D - 1.5], [22, y, D - 0.2], "grate");
  for (let x = -5; x <= 21; x += 3) b.box([x, y - 0.5, D - 0.5], [0.12, 0.9, 1.0], "steelPainted"); // brackets
  railing(b, [-6, y, D - 1.55], [22, y, D - 1.55]);
  // cross bridge over the aisle at x = 6, y = 7.2
  const by = 7.2;
  b.boxMinMax([5.4, by - 0.1, -12], [6.6, by, 12], "grate");
  b.box([6, by - 0.25, 0], [0.15, 0.3, 24], "steelPainted");
  for (const z of [-12, -4, 4, 12]) b.box([6, by / 2, z], [0.3, by - 0.1, 0.3], "steelPainted");
  railing(b, [5.4, by, -12], [5.4, by, 12]);
  railing(b, [6.6, by, -12], [6.6, by, 12]);
  // north wall gantry along the pipes, y = 6.3
  b.boxMinMax([-23, 6.2, -D + 0.2], [10, 6.3, -D + 1.3], "grate");
  for (let x = -22; x <= 9; x += 3) b.box([x, 5.8, -D + 0.5], [0.1, 0.8, 0.7], "steelPainted");
  railing(b, [-23, 6.3, -D + 1.35], [10, 6.3, -D + 1.35]);
}

function pipeRun(b: SolidBuilder, a: Vec3Tuple, c: Vec3Tuple, r: number, mat: "pipeRed" | "pipeGrey"): void {
  b.pipe(a, c, r, mat);
  const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const n = Math.floor(len / 4);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const p: Vec3Tuple = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
    // flange collars, visual only
    const horizX = Math.abs(c[0] - a[0]) >= Math.abs(c[1] - a[1]) && Math.abs(c[0] - a[0]) >= Math.abs(c[2] - a[2]);
    const rot: Vec3Tuple = horizX ? [0, 0, Math.PI / 2] : Math.abs(c[2] - a[2]) > Math.abs(c[1] - a[1]) ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    b.solids.push({ shape: "cylinder", position: p, size: [r * 1.35, 0.14, 0], rotation: rot, material: "steel", collide: false });
  }
}

function pipesAndElectrical(b: SolidBuilder): void {
  pipeRun(b, [-23.4, 10.6, -12], [23.4, 10.6, -12], 0.26, "pipeRed");
  pipeRun(b, [-23.4, 10.1, -11.3], [23.4, 10.1, -11.3], 0.17, "pipeGrey");
  pipeRun(b, [-23, 3.2, -13.4], [11.5, 3.2, -13.4], 0.14, "pipeGrey");
  pipeRun(b, [-23.4, 10.4, 12.5], [-6, 10.4, 12.5], 0.2, "pipeGrey");
  pipeRun(b, [-23.4, 0.2, -13.4], [-23.4, 10.6, -13.4], 0.2, "pipeRed");
  pipeRun(b, [-23.4, 10.6, -13.4], [-23.4, 10.6, -12], 0.2, "pipeRed");
  pipeRun(b, [3.5, 0.0, 13.4], [3.5, 10.4, 13.4], 0.16, "pipeGrey");
  for (let x = -22; x <= 22; x += 4) b.box([x, 10.6, -12], [0.1, 0.9, 0.7], "steel", { collide: false }); // hangers

  // cable tray + conduits along the west wall
  b.boxMinMax([-23.7, 8.7, -13], [-23.3, 8.8, 13], "grate");
  b.box([-23.55, 8.9, 0], [0.08, 0.08, 26], "rubber");
  // electrical cabinets along the west wall
  for (let i = 0; i < 5; i++) {
    const z = -9 + i * 1.0;
    b.box([-23.5, 1.05, z], [0.7, 2.1, 0.9], i % 2 ? "steelPainted" : "steel");
    b.box([-23.1, 1.4, z], [0.04, 0.2, 0.3], "lamp", { collide: false });
  }
  // transformer unit near east door
  b.box([22.2, 1.0, 11], [1.6, 2.0, 1.4], "safetyYellow");
  b.box([22.2, 2.15, 11], [1.2, 0.3, 1.0], "steel");
  // conduit drops
  for (const x of [-12, 12]) b.pipe([x + 0.4, 0.5, 10.4], [x + 0.4, 9.2, 10.4], 0.04, "rubber", { collide: false });
}

function machinery(b: SolidBuilder): void {
  // process tanks
  b.drum([-4.5, 0, 9], 1.1, 4.4, "steelPainted");
  b.drum([-4.5, 0, 12.2], 0.9, 3.2, "steel");
  pipeRun(b, [-4.5, 3.0, 9], [-4.5, 3.0, 12.2], 0.12, "pipeGrey");
  // press line along the east side of the aisle
  b.box([9, 1.1, 3], [3.0, 2.2, 2.2], "safetyBlue");
  b.box([9, 2.4, 3], [1.2, 0.4, 1.2], "steel");
  b.box([9, 1.4, 4.2], [2.2, 0.9, 0.05], "glass", { collide: false });
  b.box([9, 1.0, 7.5], [3.0, 2.0, 2.0], "steelPainted");
  b.box([10.8, 0.9, 10.6], [1.6, 1.8, 1.2], "steel");
  // conveyor along X at z = -6
  b.box([2, 0.95, -6], [14, 0.15, 0.9], "rubber");
  for (let x = -4; x <= 8; x += 2) {
    b.box([x, 0.45, -6.35], [0.12, 0.9, 0.12], "steelPainted");
    b.box([x, 0.45, -5.65], [0.12, 0.9, 0.12], "steelPainted");
  }
  for (const x of [-1, 3, 7]) b.box([x, 1.2, -6], [0.8, 0.5, 0.6], "cardboard");
  // bollards at the aisle
  for (const z of [-10, -3, 3]) b.drum([-3.6, 0, z], 0.12, 0.9, "safetyYellow");
}
