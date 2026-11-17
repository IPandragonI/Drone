import type { EnvironmentDef, Solid } from "./types";

export interface MapRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Solids that appear on the minimap: real geometry, not the ground plane or huge backdrops. */
export function isMapSolid(s: Solid): boolean {
  if (s.material === "ground" || s.material === "grass" || s.material === "sand" || s.collide === false) return false;
  if (s.material === "foliage" || (s.shape === "cylinder" && s.size[0] < 0.5 && s.material === "wood")) return false; // individual trees would drown the map
  const [sx, sy, sz] = s.size;
  return s.shape === "box" ? Math.max(sx, sz) < 150 && s.position[1] + sy / 2 > 0.4 : s.size[0] < 40;
}

/** Horizontal extent of the playable structures (padded), used to fit the minimap. */
export function computeMapRect(env: EnvironmentDef, pad = 2): MapRect {
  if (env.mapRect) return env.mapRect;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of env.solids) {
    if (!isMapSolid(s)) continue;
    const r = s.shape === "box" ? Math.hypot(s.size[0], s.size[2]) / 2 : s.size[0];
    minX = Math.min(minX, s.position[0] - r);
    maxX = Math.max(maxX, s.position[0] + r);
    minZ = Math.min(minZ, s.position[2] - r);
    maxZ = Math.max(maxZ, s.position[2] + r);
  }
  if (!Number.isFinite(minX)) return { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

/** World (x,z) -> pixel in a w*h map, preserving aspect ratio (letterboxed). Forward (-Z) is up. */
export function worldToMap(x: number, z: number, rect: MapRect, w: number, h: number): [number, number] {
  const sx = w / (rect.maxX - rect.minX);
  const sz = h / (rect.maxZ - rect.minZ);
  const k = Math.min(sx, sz);
  const ox = (w - (rect.maxX - rect.minX) * k) / 2;
  const oz = (h - (rect.maxZ - rect.minZ) * k) / 2;
  return [ox + (x - rect.minX) * k, oz + (z - rect.minZ) * k];
}
