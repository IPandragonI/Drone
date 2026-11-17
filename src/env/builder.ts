import type { MaterialId, Solid } from "./types";
import type { Vec3Tuple } from "@/sim/types";

/** Small helpers for assembling modular procedural geometry. Pure data, no rendering. */
export class SolidBuilder {
  readonly solids: Solid[] = [];

  /** Axis-aligned box from min/max corners. */
  boxMinMax(min: Vec3Tuple, max: Vec3Tuple, material: MaterialId, opts: Partial<Solid> = {}): this {
    this.solids.push({
      shape: "box",
      position: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      material,
      ...opts,
    });
    return this;
  }

  /** Box from centre + size. */
  box(position: Vec3Tuple, size: Vec3Tuple, material: MaterialId, opts: Partial<Solid> = {}): this {
    this.solids.push({ shape: "box", position, size, material, ...opts });
    return this;
  }

  /** Cylinder along an axis between two ends. */
  pipe(a: Vec3Tuple, b: Vec3Tuple, radius: number, material: MaterialId, opts: Partial<Solid> = {}): this {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    // Cylinder axis is local Y. Orient to the (axis-aligned) pipe direction.
    let rotation: Vec3Tuple = [0, 0, 0];
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) rotation = [0, 0, Math.PI / 2];
    else if (Math.abs(dz) >= Math.abs(dy)) rotation = [Math.PI / 2, 0, 0];
    this.solids.push({
      shape: "cylinder",
      position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      size: [radius, len, 0],
      rotation,
      material,
      ...opts,
    });
    return this;
  }

  /** Standing cylinder (tank, drum). */
  drum(base: Vec3Tuple, radius: number, height: number, material: MaterialId, opts: Partial<Solid> = {}): this {
    this.solids.push({
      shape: "cylinder",
      position: [base[0], base[1] + height / 2, base[2]],
      size: [radius, height, 0],
      material,
      ...opts,
    });
    return this;
  }

  /**
   * Wall along X (axis 'x', fixed z) or along Z (axis 'z', fixed x) with rectangular openings.
   * Openings are [from, to, yBottom, yTop] along the wall axis. Wall is split into boxes around them.
   */
  wall(
    axis: "x" | "z",
    fixed: number,
    from: number,
    to: number,
    y0: number,
    y1: number,
    thickness: number,
    material: MaterialId,
    openings: Array<[number, number, number, number]> = [],
    opts: Partial<Solid> = {},
  ): this {
    const place = (a0: number, a1: number, b0: number, b1: number): void => {
      if (a1 - a0 < 1e-3 || b1 - b0 < 1e-3) return;
      const min: Vec3Tuple = axis === "x" ? [a0, b0, fixed - thickness / 2] : [fixed - thickness / 2, b0, a0];
      const max: Vec3Tuple = axis === "x" ? [a1, b1, fixed + thickness / 2] : [fixed + thickness / 2, b1, a1];
      this.boxMinMax(min, max, material, opts);
    };
    const ops = [...openings].sort((p, q) => p[0] - q[0]);
    let cursor = from;
    for (const [o0, o1, ob, ot] of ops) {
      place(cursor, o0, y0, y1); // full-height segment before the opening
      place(o0, o1, y0, ob); // below
      place(o0, o1, ot, y1); // above
      cursor = o1;
    }
    place(cursor, to, y0, y1);
    return this;
  }
}

/** Deterministic PRNG (mulberry32) so environments are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
