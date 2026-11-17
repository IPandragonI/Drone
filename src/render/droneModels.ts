import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  LinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  SphereGeometry,
  BoxGeometry,
  Shape,
  CircleGeometry,
  TorusGeometry,
  Vector2,
  Matrix4,
  Euler,
  Quaternion,
  Vector3,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DroneConfig } from "@/config/drones/types";
import { MOTOR_SPIN, MOTOR_X_SIGN, MOTOR_Z_SIGN } from "@/sim/flight/mixer";

/**
 * Detailed drone models built from code (original geometry, no third-party assets, so no licence terms).
 * Static parts are merged into one mesh per material (a handful of draw calls per drone); each propeller is its own
 * group so it can spin at its simulated rotor speed. Frame: +Y up, front = -Z. Motors sit exactly where the physics puts them
 * and the FPV lens sits exactly at `drone.camera.fpv.position`, so what the pilot sees matches what is simulated.
 */

/** Visual propeller speed at full rotor speed, rad/s (display only). */
export const MAX_PROP_OMEGA = 220;

type V3 = [number, number, number];
type Key = "carbon" | "accent" | "alu" | "pcb" | "rubber" | "glass" | "plastic" | "metal" | "lamp" | "ledRed" | "ledGreen" | "yellow" | "body";

export interface DroneModel {
  root: Group;
  props: Group[];
  /** Advance propeller rotation and blur from rotor speeds (0..1). */
  update(motors: ArrayLike<number>, dt: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------- materials

function makeMaterials(drone: DroneConfig): Record<Key, Material> {
  const { color, accent } = drone.model;
  const physical = (c: string, o: { roughness: number; metalness: number; clearcoat?: number }) =>
    new MeshPhysicalMaterial({ color: c, roughness: o.roughness, metalness: o.metalness, clearcoat: o.clearcoat ?? 0, clearcoatRoughness: 0.25 });
  const std = (c: string, roughness: number, metalness: number) => new MeshStandardMaterial({ color: c, roughness, metalness });
  return {
    carbon: physical("#0b0c0e", { roughness: 0.5, metalness: 0.25, clearcoat: 0.3 }),
    accent: physical(accent, { roughness: 0.35, metalness: 0.55, clearcoat: 0.4 }),
    alu: std("#8e949a", 0.32, 0.9),
    pcb: std("#16301f", 0.55, 0.3),
    rubber: std("#101113", 0.9, 0),
    glass: new MeshPhysicalMaterial({ color: "#0a0f1c", roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
    plastic: std("#23262b", 0.6, 0.1),
    metal: std("#b9bec4", 0.28, 0.95),
    lamp: new MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6e0", emissiveIntensity: 2.2, roughness: 0.4 }),
    ledRed: new MeshStandardMaterial({ color: "#ff3a2a", emissive: "#ff2010", emissiveIntensity: 2, roughness: 0.4 }),
    ledGreen: new MeshStandardMaterial({ color: "#3aff7a", emissive: "#10ff50", emissiveIntensity: 2, roughness: 0.4 }),
    yellow: std("#d9a81a", 0.5, 0.2),
    body: physical(color, { roughness: 0.5, metalness: 0.2, clearcoat: 0.35 }),
  };
}

let blurTexture: Texture | null = null;
/** Radial alpha ring used for the propeller motion-blur disc (DataTexture, so it also works without a canvas). */
function getBlurTexture(): Texture {
  if (blurTexture) return blurTexture;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
      const a = r > 1 ? 0 : r < 0.18 ? 0 : Math.min(1, (r - 0.18) / 0.3) * (r > 0.85 ? (1 - r) / 0.15 : 1);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, N, N, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  blurTexture = t;
  return t;
}

// ---------------------------------------------------------------- geometry helpers

class Parts {
  private buckets = new Map<Key, BufferGeometry[]>();
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private p = new Vector3();
  private s = new Vector3(1, 1, 1);

  add(key: Key, geo: BufferGeometry, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
    this.e.set(rot[0], rot[1], rot[2], "YXZ");
    this.q.setFromEuler(this.e);
    this.p.set(...pos);
    this.s.set(...scale);
    this.m.compose(this.p, this.q, this.s);
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(this.m);
    g.deleteAttribute("uv"); // merged parts share one attribute layout
    const list = this.buckets.get(key) ?? [];
    list.push(g);
    this.buckets.set(key, list);
    geo.dispose();
  }

  box(key: Key, size: V3, pos: V3, rot?: V3): void {
    this.add(key, new BoxGeometry(...size), pos, rot);
  }
  /** Cylinder with its axis along Y (rotate to reorient). */
  cyl(key: Key, rTop: number, rBottom: number, h: number, pos: V3, rot?: V3, seg = 16): void {
    this.add(key, new CylinderGeometry(rTop, rBottom, h, seg), pos, rot);
  }
  /** Tube between two points. */
  tube(key: Key, a: V3, b: V3, r: number, seg = 10): void {
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize());
    const e = new Euler().setFromQuaternion(q, "YXZ");
    this.add(key, new CylinderGeometry(r, r, len, seg), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
  }
  sphere(key: Key, r: number, pos: V3, scale: V3 = [1, 1, 1]): void {
    this.add(key, new SphereGeometry(r, 18, 12), pos, [0, 0, 0], scale);
  }

  build(mats: Record<Key, Material>, into: Group): void {
    for (const [key, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new Mesh(merged, mats[key]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `parts-${key}`;
      into.add(mesh);
    }
  }
}

/** Tapered, twisted propeller blade along +X lying in the XZ plane. */
function bladeGeometry(r0: number, R: number, chordRoot: number, chordTip: number, pitchRootDeg: number, pitchTipDeg: number, thickness: number): BufferGeometry {
  const s = new Shape();
  s.moveTo(r0, -chordRoot * 0.5);
  s.lineTo(R * 0.55, -chordRoot * 0.62);
  s.quadraticCurveTo(R * 0.92, -chordTip * 0.6, R, -chordTip * 0.15);
  s.quadraticCurveTo(R * 1.005, chordTip * 0.4, R * 0.93, chordTip * 0.5);
  s.lineTo(R * 0.5, chordRoot * 0.5);
  s.lineTo(r0, chordRoot * 0.5);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(-Math.PI / 2); // shape XY -> XZ plane, thickness along +Y
  const pos = g.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = Math.min(1, Math.max(0, (x - r0) / (R - r0)));
    const a = ((pitchRootDeg + (pitchTipDeg - pitchRootDeg) * t) * Math.PI) / 180;
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setY(i, y * Math.cos(a) - z * Math.sin(a));
    pos.setZ(i, y * Math.sin(a) + z * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}

interface PropSpec {
  radius: number;
  blades: number;
  chordRoot: number;
  chordTip: number;
  hubR: number;
  thickness: number;
}

/** One propeller (hub + blades) and a blur disc. Returns the group (pivot at the hub) and the blur material. */
function makeProp(spec: PropSpec, bladeMat: Material, hubMat: Material, blurColor: string, blurTex: Texture): { group: Group; blur: MeshBasicMaterial; blades: Material } {
  const g = new Group();
  const bm = bladeMat.clone();
  bm.transparent = true;
  const geos: BufferGeometry[] = [];
  for (let b = 0; b < spec.blades; b++) {
    const blade = bladeGeometry(spec.hubR * 0.8, spec.radius, spec.chordRoot, spec.chordTip, 26, 11, spec.thickness);
    blade.rotateY((b * Math.PI * 2) / spec.blades);
    geos.push(blade.index ? blade.toNonIndexed() : blade);
  }
  const bladesGeo = mergeGeometries(geos, false);
  const blades = new Mesh(bladesGeo ?? undefined, bm);
  blades.castShadow = true;
  g.add(blades);
  const hub = new Mesh(new CylinderGeometry(spec.hubR, spec.hubR * 1.15, spec.thickness * 5, 16), hubMat);
  hub.castShadow = true;
  g.add(hub);
  const blur = new MeshBasicMaterial({ color: blurColor, map: blurTex, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
  const disc = new Mesh(new CircleGeometry(spec.radius * 0.98, 40), blur);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = spec.thickness * 1.5;
  disc.name = "blur";
  g.add(disc);
  return { group: g, blur, blades: bm };
}

// ---------------------------------------------------------------- the three drones

function motorPositions(drone: DroneConfig): V3[] {
  const a = drone.physics.armLengthM / Math.SQRT2;
  return [0, 1, 2, 3].map((i) => [MOTOR_X_SIGN[i] * a, 0, MOTOR_Z_SIGN[i] * a] as V3);
}

function arm(parts: Parts, key: Key, motor: V3, width: number, height: number, y = 0): void {
  const len = Math.hypot(motor[0], motor[2]);
  const ang = Math.atan2(motor[0], motor[2]);
  parts.add(key, new BoxGeometry(width, height, len), [motor[0] / 2, y, motor[2] / 2], [0, ang, 0]);
}

function fpvFreestyle(drone: DroneConfig, parts: Parts, mats: Record<Key, Material>): { motorTop: number; prop: PropSpec } {
  const motors = motorPositions(drone);
  // Carbon plates: bottom plate (the arms run through it), top plate, aluminium standoffs.
  parts.box("carbon", [0.052, 0.003, 0.13], [0, -0.012, 0.005]);
  parts.box("carbon", [0.044, 0.003, 0.11], [0, 0.021, 0.008]);
  for (const [x, z] of [[-0.02, -0.04], [0.02, -0.04], [-0.02, 0.055], [0.02, 0.055]] as const) parts.cyl("alu", 0.0035, 0.0035, 0.033, [x, 0.0045, z], undefined, 10);
  // Arms: 5 mm carbon, accent-coloured front pair.
  motors.forEach((m, i) => arm(parts, MOTOR_Z_SIGN[i] < 0 ? "accent" : "carbon", m, 0.017, 0.005, -0.012));
  // Flight controller / ESC stack, VTX.
  parts.box("pcb", [0.036, 0.004, 0.036], [0, 0.0, 0.02]);
  parts.box("pcb", [0.036, 0.004, 0.036], [0, 0.008, 0.02]);
  parts.box("plastic", [0.026, 0.006, 0.026], [0, 0.0145, 0.04]);
  // Battery: LiPo with label stripe, rubber strap, XT60 lead at the rear.
  parts.box("plastic", [0.03, 0.03, 0.098], [0, 0.0405, 0.015]);
  parts.box("accent", [0.0305, 0.012, 0.03], [0, 0.0405, 0.015]);
  parts.box("rubber", [0.034, 0.034, 0.012], [0, 0.0405, -0.02]);
  parts.box("rubber", [0.034, 0.034, 0.012], [0, 0.0405, 0.05]);
  parts.box("yellow", [0.012, 0.008, 0.016], [0, 0.03, 0.078]);
  // FPV camera: cheeks (accent), body, lens barrel + glass. Lens front is at drone.camera.fpv.position, tilted up.
  const cam = drone.camera.fpv.position;
  const tilt = (drone.camera.fpv.tiltDeg * Math.PI) / 180;
  const camPos: V3 = [cam[0], cam[1], cam[2] + 0.014];
  parts.add("accent", new BoxGeometry(0.004, 0.03, 0.03), [camPos[0] - 0.014, camPos[1], camPos[2] + 0.004], [-tilt, 0, 0]);
  parts.add("accent", new BoxGeometry(0.004, 0.03, 0.03), [camPos[0] + 0.014, camPos[1], camPos[2] + 0.004], [-tilt, 0, 0]);
  parts.add("plastic", new BoxGeometry(0.024, 0.024, 0.022), camPos, [-tilt, 0, 0]);
  const fwd = new Vector3(0, Math.sin(tilt), -Math.cos(tilt));
  const lensC: V3 = [cam[0] + fwd.x * -0.004, cam[1] + fwd.y * -0.004, cam[2] + fwd.z * -0.004];
  parts.add("metal", new CylinderGeometry(0.0085, 0.0085, 0.012, 20), lensC, [Math.PI / 2 - tilt, 0, 0]);
  parts.add("glass", new CylinderGeometry(0.0062, 0.0062, 0.0125, 20), lensC, [Math.PI / 2 - tilt, 0, 0]);
  // Antenna mast (rear) and LEDs.
  parts.tube("carbon", [0, 0.02, 0.07], [0, 0.058, 0.09], 0.0022, 6);
  parts.sphere("rubber", 0.004, [0, 0.059, 0.0905]);
  parts.box("ledRed", [0.02, 0.003, 0.003], [0, -0.01, 0.076]);
  parts.box("lamp", [0.01, 0.003, 0.003], [0, 0.0, -0.062]);
  // Motors: stator + bell with hub ring, screws.
  motors.forEach((m, i) => {
    parts.cyl("accent", 0.0135, 0.015, 0.008, [m[0], -0.002, m[2]], undefined, 18);
    parts.cyl("metal", 0.0145, 0.0145, 0.013, [m[0], 0.0085, m[2]], undefined, 20);
    parts.cyl("alu", 0.0075, 0.0075, 0.003, [m[0], 0.0165, m[2]], undefined, 12);
    for (let s = 0; s < 4; s++) parts.cyl("alu", 0.0012, 0.0012, 0.003, [m[0] + Math.cos((s * Math.PI) / 2) * 0.0095, 0.0005, m[2] + Math.sin((s * Math.PI) / 2) * 0.0095], undefined, 6);
    void i;
  });
  void mats;
  return { motorTop: 0.0185, prop: { radius: drone.model.propRadiusM, blades: 3, chordRoot: 0.012, chordTip: 0.007, hubR: 0.0055, thickness: 0.0014 } };
}

function inspectionQuad(drone: DroneConfig, parts: Parts): { motorTop: number; prop: PropSpec } {
  const motors = motorPositions(drone);
  // Fuselage: shell, spine, accent band, battery bays on both flanks.
  parts.add("body", new BoxGeometry(0.15, 0.07, 0.24), [0, 0, 0.0]);
  parts.add("body", new BoxGeometry(0.12, 0.03, 0.2), [0, 0.045, 0.005]);
  parts.add("accent", new BoxGeometry(0.152, 0.014, 0.1), [0, 0.0, -0.02]);
  for (const s of [-1, 1]) {
    parts.add("plastic", new BoxGeometry(0.034, 0.06, 0.16), [s * 0.092, 0.0, 0.02]);
    parts.add("accent", new BoxGeometry(0.0345, 0.008, 0.16), [s * 0.092, 0.022, 0.02]);
  }
  // Nose: FPV camera at the configured position, landing light, sensor window.
  const cam = drone.camera.fpv.position;
  parts.add("plastic", new BoxGeometry(0.06, 0.036, 0.04), [0, 0.0, cam[2] + 0.025]);
  parts.add("glass", new CylinderGeometry(0.011, 0.011, 0.006, 20), [cam[0], cam[1], cam[2] + 0.004], [Math.PI / 2, 0, 0]);
  parts.add("metal", new TorusGeometry(0.0125, 0.0022, 8, 20), [cam[0], cam[1], cam[2] + 0.001]);
  parts.box("lamp", [0.016, 0.008, 0.004], [0.03, -0.012, cam[2] + 0.0045]);
  parts.box("lamp", [0.016, 0.008, 0.004], [-0.03, -0.012, cam[2] + 0.0045]);
  // Under-slung stabilised gimbal: yoke, ball, lenses.
  parts.box("plastic", [0.05, 0.014, 0.05], [0, -0.042, -0.1]);
  parts.box("alu", [0.004, 0.05, 0.004], [-0.026, -0.07, -0.1]);
  parts.box("alu", [0.004, 0.05, 0.004], [0.026, -0.07, -0.1]);
  parts.box("alu", [0.056, 0.004, 0.004], [0, -0.1, -0.1]);
  parts.sphere("plastic", 0.034, [0, -0.072, -0.1]);
  parts.add("glass", new CylinderGeometry(0.014, 0.014, 0.012, 24), [0, -0.068, -0.132], [Math.PI / 2, 0, 0]);
  parts.add("metal", new TorusGeometry(0.0155, 0.0025, 8, 24), [0, -0.068, -0.1335]);
  parts.add("glass", new CylinderGeometry(0.008, 0.008, 0.01, 18), [0.017, -0.088, -0.128], [Math.PI / 2, 0, 0]);
  // GPS mast and puck, rear antennas.
  parts.cyl("alu", 0.004, 0.004, 0.06, [0, 0.095, 0.07], undefined, 8);
  parts.add("plastic", new CylinderGeometry(0.03, 0.03, 0.014, 24), [0, 0.128, 0.07]);
  parts.add("body", new SphereGeometry(0.03, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.135, 0.07]);
  for (const s of [-1, 1]) parts.tube("rubber", [s * 0.04, 0.05, 0.1], [s * 0.065, 0.12, 0.13], 0.003, 6);
  // Arms (round tubes with folding joint), motor housings, nav lights, landing gear.
  motors.forEach((m, i) => {
    const root: V3 = [m[0] * 0.28, 0, m[2] * 0.28];
    parts.tube("body", root, [m[0], 0, m[2]], 0.016, 12);
    parts.cyl("alu", 0.021, 0.021, 0.03, [m[0] * 0.42, 0, m[2] * 0.42], undefined, 14);
    parts.cyl("accent", 0.031, 0.034, 0.016, [m[0], -0.006, m[2]], undefined, 20);
    parts.cyl("metal", 0.029, 0.029, 0.034, [m[0], 0.018, m[2]], undefined, 24);
    parts.cyl("alu", 0.011, 0.011, 0.004, [m[0], 0.037, m[2]], undefined, 14);
    parts.sphere(MOTOR_Z_SIGN[i] < 0 ? "ledGreen" : "ledRed", 0.006, [m[0] * 1.06, -0.016, m[2] * 1.06]);
  });
  for (const s of [-1, 1]) {
    parts.tube("alu", [s * 0.115, -0.1, -0.13], [s * 0.115, -0.1, 0.13], 0.007, 10); // skid
    for (const z of [-0.08, 0.1]) parts.tube("alu", [s * 0.075, -0.03, z], [s * 0.115, -0.1, z], 0.006, 8);
    parts.sphere("rubber", 0.008, [s * 0.115, -0.1, -0.13]);
    parts.sphere("rubber", 0.008, [s * 0.115, -0.1, 0.13]);
  }
  return { motorTop: 0.04, prop: { radius: drone.model.propRadiusM, blades: 2, chordRoot: 0.02, chordTip: 0.012, hubR: 0.011, thickness: 0.0022 } };
}

function cinewhoop(drone: DroneConfig, parts: Parts): { motorTop: number; prop: PropSpec } {
  const motors = motorPositions(drone);
  const pr = drone.model.propRadiusM;
  // Frame: bottom + top plates, standoffs, stubby arms.
  parts.box("carbon", [0.05, 0.003, 0.1], [0, -0.008, 0.004]);
  parts.box("carbon", [0.044, 0.003, 0.09], [0, 0.016, 0.004]);
  for (const [x, z] of [[-0.018, -0.03], [0.018, -0.03], [-0.018, 0.04], [0.018, 0.04]] as const) parts.cyl("alu", 0.003, 0.003, 0.024, [x, 0.004, z], undefined, 10);
  motors.forEach((m) => arm(parts, "carbon", m, 0.012, 0.004, -0.008));
  parts.box("pcb", [0.03, 0.004, 0.03], [0, 0.002, 0.015]);
  parts.box("pcb", [0.03, 0.004, 0.03], [0, 0.009, 0.015]);
  // Under-slung battery and rubber strap.
  parts.box("plastic", [0.026, 0.02, 0.07], [0, -0.0225, 0.01]);
  parts.box("rubber", [0.03, 0.024, 0.01], [0, -0.0225, 0.01]);
  // Action camera on top with lens, FPV camera at the configured position.
  parts.box("plastic", [0.058, 0.036, 0.03], [0, 0.036, -0.004]);
  parts.add("glass", new CylinderGeometry(0.011, 0.011, 0.006, 20), [0, 0.038, -0.021], [Math.PI / 2, 0, 0]);
  parts.add("metal", new TorusGeometry(0.0125, 0.0022, 8, 20), [0, 0.038, -0.0185]);
  parts.box("accent", [0.06, 0.004, 0.032], [0, 0.0555, -0.004]);
  const cam = drone.camera.fpv.position;
  const tilt = (drone.camera.fpv.tiltDeg * Math.PI) / 180;
  parts.add("plastic", new BoxGeometry(0.022, 0.022, 0.02), [cam[0], cam[1], cam[2] + 0.012], [-tilt, 0, 0]);
  parts.add("glass", new CylinderGeometry(0.0062, 0.0062, 0.006, 18), [cam[0], cam[1], cam[2] + 0.001], [Math.PI / 2 - tilt, 0, 0]);
  parts.tube("rubber", [0, 0.016, 0.045], [0, 0.04, 0.062], 0.002, 6);
  parts.box("ledRed", [0.016, 0.003, 0.003], [0, -0.01, 0.054]);
  // Ducts: lathe ring with bell-mouth inlet, joined to the frame by two struts each; motors inside.
  const profile = [
    new Vector2(pr * 1.01, -0.018), new Vector2(pr * 1.26, -0.018), new Vector2(pr * 1.3, -0.008), new Vector2(pr * 1.3, 0.014),
    new Vector2(pr * 1.24, 0.02), new Vector2(pr * 1.12, 0.0205), new Vector2(pr * 1.03, 0.015), new Vector2(pr * 1.01, 0.0),
  ];
  motors.forEach((m, i) => {
    parts.add(MOTOR_Z_SIGN[i] < 0 ? "accent" : "body", new LatheGeometry(profile, 36), [m[0], 0, m[2]]);
    const dir = new Vector3(-m[0], 0, -m[2]).normalize();
    for (const off of [-0.012, 0.012]) {
      const px = -dir.z * off;
      const pz = dir.x * off;
      parts.tube("carbon", [m[0] + dir.x * pr * 1.05 + px, -0.005, m[2] + dir.z * pr * 1.05 + pz], [m[0] * 0.35 + px * 0.4, -0.006, m[2] * 0.35 + pz * 0.4], 0.0033, 6);
    }
    parts.cyl("accent", 0.0105, 0.0115, 0.006, [m[0], -0.004, m[2]], undefined, 16);
    parts.cyl("metal", 0.0112, 0.0112, 0.011, [m[0], 0.0055, m[2]], undefined, 18);
    parts.cyl("alu", 0.006, 0.006, 0.003, [m[0], 0.0125, m[2]], undefined, 10);
  });
  return { motorTop: 0.0145, prop: { radius: pr * 0.98, blades: 3, chordRoot: 0.0095, chordTip: 0.0055, hubR: 0.0045, thickness: 0.0011 } };
}

// ---------------------------------------------------------------- public API

/** Build a complete drone model for a config. Cheap enough to call once per flight/viewer. */
export function buildDroneModel(drone: DroneConfig): DroneModel {
  const mats = makeMaterials(drone);
  const parts = new Parts();
  const root = new Group();
  root.name = `drone-${drone.id}`;
  const spec = drone.category === "fpv" ? fpvFreestyle(drone, parts, mats) : drone.category === "inspection" ? inspectionQuad(drone, parts) : cinewhoop(drone, parts);
  parts.build(mats, root);

  const tex = getBlurTexture();
  const propMat = drone.category === "inspection" ? mats.plastic : mats.carbon;
  const hubMat = drone.category === "inspection" ? mats.accent : mats.alu;
  const motors = motorPositions(drone);
  const props: Group[] = [];
  const blurs: MeshBasicMaterial[] = [];
  const blades: Material[] = [];
  const fx: Group[] = [];
  motors.forEach((m, i) => {
    const front = MOTOR_Z_SIGN[i] < 0;
    const p = makeProp(spec.prop, drone.category === "fpv" && front ? mats.accent : propMat, hubMat, drone.category === "inspection" ? "#cfd4d8" : "#d7dce0", tex);
    p.group.position.set(m[0], spec.motorTop, m[2]);
    p.group.rotation.y = (i * 0.7) % (Math.PI * 2); // desynchronise props
    root.add(p.group);
    props.push(p.group);
    blurs.push(p.blur);
    blades.push(p.blades);
    fx.push(p.group);
  });

  return {
    root,
    props,
    update(motorSpeeds, dt) {
      const step = Math.min(dt, 0.05);
      for (let i = 0; i < 4; i++) {
        const s = Math.min(1, Math.max(0, motorSpeeds[i] ?? 0));
        props[i].rotation.y += MOTOR_SPIN[i] * s * MAX_PROP_OMEGA * step;
        blurs[i].opacity = 0.5 * Math.min(1, s * 1.8);
        blades[i].opacity = 1 - 0.55 * Math.min(1, s * 1.8);
      }
    },
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
      });
      Object.values(mats).forEach((m) => m.dispose());
      blurs.forEach((m) => m.dispose());
      blades.forEach((m) => m.dispose());
      void fx;
    },
  };
}
