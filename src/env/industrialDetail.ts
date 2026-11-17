import type { SolidBuilder } from "./builder";

const W = 24;
const D = 14;
const H = 12;

/**
 * Architectural and service detail for the Industrial Complex. Everything here sits against the walls, in the roof zone
 * or on the floor as decals, so the flyable aisles and the mission routes stay clear (missions.test.ts proves it).
 * Collision policy: large masses collide; thin visual detail (cables, hangers, decals, signs) is visual-only.
 */
export function addIndustrialDetail(b: SolidBuilder, rnd: () => number): void {
  wallArchitecture(b);
  roofServices(b);
  lighting(b);
  floorMarkings(b, rnd);
  wallEquipment(b);
  stock(b, rnd);
}

function wallArchitecture(b: SolidBuilder): void {
  // Pilasters on the long walls (skip the roller-door opening on the south wall).
  for (let x = -21; x <= 21; x += 6) {
    b.box([x, H / 2, -D + 0.5], [0.6, H, 0.6], "concrete");
    if (Math.abs(x) > 5) b.box([x, H / 2, D - 0.5], [0.6, H, 0.6], "concrete");
  }
  // Pilasters on the end walls, clear of the door/opening zones.
  for (const z of [-11, -6, 6, 11]) {
    b.box([-W + 0.5, H / 2, z], [0.6, H, 0.6], "concrete");
    if (Math.abs(z - 5) > 3) b.box([W - 0.5, H / 2, z], [0.6, H, 0.6], "concrete");
  }
  // Painted dado band and kick plate (visual), horizontal girts (visual).
  b.box([0, 1.1, -D + 0.23], [2 * W - 1, 2.2, 0.06], "safetyBlue", { collide: false });
  b.box([-W + 0.23, 1.1, 0], [0.06, 2.2, 2 * D - 1], "safetyBlue", { collide: false });
  for (const y of [4.5, 8.4]) {
    b.box([0, y, -D + 0.3], [2 * W - 1, 0.2, 0.14], "steelPainted", { collide: false });
    b.box([0, y, D - 0.3], [2 * W - 1, 0.2, 0.14], "steelPainted", { collide: false });
  }
  // Roof portal bracing: X diagonals between the wall pilasters near the roof.
  for (let x = -18; x <= 18; x += 12) {
    b.pipe([x - 3, H - 3.2, -D + 0.45], [x + 3, H - 0.4, -D + 0.45], 0.05, "steel", { collide: false });
    b.pipe([x + 3, H - 3.2, -D + 0.45], [x - 3, H - 0.4, -D + 0.45], 0.05, "steel", { collide: false });
  }
}

function roofServices(b: SolidBuilder): void {
  // Cable trays with cable bundles along the north and west walls.
  b.box([0, 6.2, -D + 0.9], [2 * W - 2, 0.08, 0.45], "steel");
  for (const [dy, m] of [[0.06, "rubber"], [0.1, "pipeRed"], [0.06, "pipeGrey"]] as const) {
    b.box([0, 6.2 + dy, -D + 0.9 + (dy - 0.08) * 1.5], [2 * W - 2.5, 0.05, 0.08], m, { collide: false });
  }
  b.box([-W + 0.9, 5.6, 0], [0.45, 0.08, 2 * D - 6], "steel");
  b.box([-W + 0.9, 5.66, 0], [0.1, 0.05, 2 * D - 7], "rubber", { collide: false });
  // Tray hangers (visual).
  for (let x = -22; x <= 22; x += 4) b.box([x, 7.1, -D + 0.9], [0.04, 1.8, 0.04], "steel", { collide: false });

  // Two rectangular HVAC ducts near the roof, with hangers and flanges.
  for (const z of [-5, 5.5]) {
    b.box([0, 10.2, z], [40, 0.95, 1.15], "metalSheet");
    for (let x = -18; x <= 18; x += 6) {
      b.box([x, 10.2, z], [0.12, 1.05, 1.28], "steelPainted", { collide: false });
      b.box([x, 11.2, z], [0.05, 1.2, 0.05], "steel", { collide: false });
    }
  }
  // Roof ventilation stacks.
  for (const [x, z] of [[-14, 0], [6, 0], [16, 6]] as const) {
    b.drum([x, 10.6, z], 0.35, 1.2, "metalSheet", { collide: false });
  }
}

function lighting(b: SolidBuilder): void {
  // High-bay luminaires on rods: visible emissive panels (the actual light comes from the scene's point lights).
  for (const x of [-18, -9, 0, 9, 18]) {
    for (const z of [-10, -2, 6, 11]) {
      b.box([x, H - 1.55, z], [1.5, 0.12, 0.45], "steelPainted", { collide: false });
      b.box([x, H - 1.63, z], [1.35, 0.03, 0.33], "lamp", { collide: false });
      for (const dx of [-0.6, 0.6]) b.box([x + dx, H - 0.8, z], [0.02, 1.5, 0.02], "steel", { collide: false });
    }
  }
}

function floorMarkings(b: SolidBuilder, rnd: () => number): void {
  // Aisle lines and crosswalk (visual decals just above the slab).
  for (const x of [-6.2, 6.2]) b.box([x, 0.03, 0], [0.16, 0.02, 2 * D - 4], "safetyYellow", { collide: false });
  for (let i = 0; i < 6; i++) b.box([-3 + i * 1.2, 0.03, 9], [0.5, 0.02, 3], i % 2 ? "concreteDark" : "safetyYellow", { collide: false });
  b.box([0, 0.03, -2.2], [12.4, 0.02, 0.16], "safetyYellow", { collide: false });
  // Hazard-striped zone around the machinery block.
  for (let i = 0; i < 8; i++) b.box([-9 + 0.01, 0.03, -2 + i * 0.9], [3.2, 0.02, 0.35], i % 2 ? "concreteDark" : "safetyYellow", { collide: false });
  // Drain grates and oil stains for wear.
  for (const x of [-12, 0, 12]) b.box([x, 0.025, -9.5], [0.9, 0.02, 6], "grate", { collide: false });
  for (let i = 0; i < 34; i++) {
    const r = 0.5 + rnd() * 1.6;
    b.box([-20 + rnd() * 40, 0.022, -12 + rnd() * 24], [r, 0.012, r * (0.6 + rnd() * 0.8)], "concreteDark", { collide: false, rotation: [0, rnd() * 3, 0] });
  }
}

function wallEquipment(b: SolidBuilder): void {
  // Electrical cabinets along the north wall with status lamps.
  for (const x of [-20, -13, 9, 17]) {
    b.box([x, 1.1, -D + 0.55], [1.2, 2.2, 0.5], "steelPainted");
    b.box([x + 0.3, 1.6, -D + 0.82], [0.08, 0.08, 0.02], "lamp", { collide: false });
    b.box([x - 0.3, 1.6, -D + 0.82], [0.08, 0.08, 0.02], "pipeRed", { collide: false });
    b.box([x, 2.45, -D + 0.5], [0.6, 0.5, 0.35], "safetyYellow", { collide: false });
  }
  // Conduits dropping from the cable tray to the cabinets.
  for (const x of [-20, -13, 9, 17]) b.pipe([x, 2.2, -D + 0.6], [x, 6.2, -D + 0.9], 0.04, "pipeGrey", { collide: false });
  // Fire extinguishers and signs next to the pilasters.
  for (const [x, z] of [[-15, -D + 0.9], [3, -D + 0.9], [15, D - 0.9], [-3, D - 0.9]] as const) {
    b.drum([x, 0.9, z], 0.1, 0.5, "pipeRed", { collide: false });
    b.box([x, 1.8, z > 0 ? D - 0.27 : -D + 0.27], [0.5, 0.4, 0.03], "safetyYellow", { collide: false });
  }
  // Wall-mounted large fans on the east wall.
  for (const z of [-9, 0, 9]) b.drum([W - 0.4, 7, z], 0.9, 0.18, "metalSheet", { collide: false, rotation: [0, 0, Math.PI / 2] });
}

function stock(b: SolidBuilder, rnd: () => number): void {
  // Drum cluster and stacked pallets against the north wall (west half), clear of the aisles.
  for (let i = 0; i < 6; i++) b.drum([-22 + (i % 3) * 0.75, 0, -12.2 + Math.floor(i / 3) * 0.75], 0.3, 0.9, i % 2 ? "safetyBlue" : "pipeRed");
  for (const x of [-18, -16.6, -15.2]) {
    b.box([x, 0.08, -12], [1.2, 0.16, 1.0], "wood");
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) b.box([x + (rnd() - 0.5) * 0.06, 0.16 + 0.3 + k * 0.6, -12], [1.1, 0.58, 0.9], "cardboard");
  }
  // Steel I-beam stock on low trestles near the east wall.
  for (let i = 0; i < 4; i++) b.box([22, 0.35 + i * 0.22, 4 + i * 0.01], [0.3, 0.2, 5], "steel");
  for (const z of [2, 6]) b.box([22, 0.12, z], [0.6, 0.24, 0.2], "wood");
}
