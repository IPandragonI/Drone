import { Color, DoubleSide, FrontSide, MeshStandardMaterial } from "three";
import type { MaterialId } from "@/env/types";
import { applyTriplanar, type TextureSet } from "./pbr";

interface Params {
  color: string;
  roughness: number;
  metalness: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

/** PBR parameters per material id. Swap to texture sets when GLB/texture assets exist. */
export const MATERIAL_PARAMS: Record<MaterialId, Params> = {
  concrete: { color: "#8d8f90", roughness: 0.95, metalness: 0 },
  concreteDark: { color: "#5d6063", roughness: 0.9, metalness: 0 },
  steel: { color: "#8a9096", roughness: 0.45, metalness: 0.85 },
  steelPainted: { color: "#4f5a63", roughness: 0.55, metalness: 0.6 },
  safetyYellow: { color: "#d8a613", roughness: 0.6, metalness: 0.3 },
  safetyBlue: { color: "#26507f", roughness: 0.6, metalness: 0.35 },
  grate: { color: "#6f777d", roughness: 0.5, metalness: 0.8 },
  metalSheet: { color: "#9aa1a6", roughness: 0.55, metalness: 0.7 },
  cardboard: { color: "#a47c4d", roughness: 0.95, metalness: 0 },
  wood: { color: "#8a6a43", roughness: 0.85, metalness: 0 },
  rubber: { color: "#1c1d1f", roughness: 0.9, metalness: 0 },
  pipeRed: { color: "#a2281d", roughness: 0.45, metalness: 0.5 },
  pipeGrey: { color: "#7e868c", roughness: 0.4, metalness: 0.7 },
  glass: { color: "#a9c6d6", roughness: 0.1, metalness: 0, opacity: 0.25 },
  lamp: { color: "#fff4dd", roughness: 0.4, metalness: 0, emissive: "#fff0cc", emissiveIntensity: 2.2 },
  ground: { color: "#4a4d4f", roughness: 1, metalness: 0 },
  grass: { color: "#7d9a5c", roughness: 0.95, metalness: 0 },
  foliage: { color: "#2d5634", roughness: 0.92, metalness: 0 },
  rock: { color: "#8b8782", roughness: 0.95, metalness: 0 },
  sand: { color: "#d4b98c", roughness: 1, metalness: 0 },
  asphalt: { color: "#55575a", roughness: 0.92, metalness: 0 },
  brick: { color: "#a05e48", roughness: 0.9, metalness: 0 },
  water: { color: "#2a6f93", roughness: 0.06, metalness: 0.15, opacity: 0.88 },
  solar: { color: "#1b2a45", roughness: 0.22, metalness: 0.65 },
  turbineWhite: { color: "#e9ebed", roughness: 0.42, metalness: 0.1 },
};

/** Which CC0 texture set (and how) each material uses. Painted materials keep their paint colour and take only detail. */
export const TEXTURE_SETS: Partial<Record<MaterialId, TextureSet>> = {
  concrete: { name: "concrete", scale: 3, useColor: true, normal: 0.9, roughness: 1, wear: 1 },
  concreteDark: { name: "concrete", scale: 2.5, useColor: true, normal: 1, roughness: 1, wear: 1 },
  ground: { name: "ground", scale: 4, useColor: true, normal: 1, roughness: 1, wear: 0.6 },
  steel: { name: "metal", scale: 1.2, useColor: true, normal: 0.8, roughness: 1, wear: 0.7 },
  steelPainted: { name: "metal", scale: 1.5, useColor: false, normal: 0.7, roughness: 1.1, wear: 0.9 },
  pipeGrey: { name: "metal", scale: 1.0, useColor: false, normal: 0.6, roughness: 1, wear: 0.8 },
  pipeRed: { name: "metal", scale: 1.0, useColor: false, normal: 0.6, roughness: 1.1, wear: 0.8 },
  safetyYellow: { name: "metal", scale: 1.0, useColor: false, normal: 0.6, roughness: 1.2, wear: 0.9 },
  safetyBlue: { name: "metal", scale: 1.0, useColor: false, normal: 0.6, roughness: 1.2, wear: 0.9 },
  metalSheet: { name: "corrugated", scale: 2, useColor: true, normal: 1, roughness: 1, wear: 0.8 },
  grate: { name: "walkway", scale: 1.5, useColor: true, normal: 1, roughness: 1, wear: 0.5 },
  wood: { name: "wood", scale: 1.2, useColor: true, normal: 0.8, roughness: 1, wear: 0.6 },
  grass: { name: "grass", scale: 3, useColor: true, normal: 1, roughness: 1, wear: 0.35 },
  foliage: { name: "grass", scale: 1.2, useColor: false, normal: 0.9, roughness: 1, wear: 0.5 },
  rock: { name: "rock", scale: 4, useColor: true, normal: 1, roughness: 1, wear: 0.5 },
  sand: { name: "sand", scale: 5, useColor: true, normal: 1, roughness: 1, wear: 0.3 },
  asphalt: { name: "asphalt", scale: 3, useColor: true, normal: 1, roughness: 1, wear: 0.8 },
  brick: { name: "brick", scale: 2.5, useColor: true, normal: 1, roughness: 1, wear: 1 },
};

const cache = new Map<string, MeshStandardMaterial>();

/** `textured` false = flat PBR parameters only (Low graphics preset). */
export function getMaterial(id: MaterialId, textured = true): MeshStandardMaterial {
  const key = `${id}|${textured}`;
  let m = cache.get(key);
  if (!m) {
    const p = MATERIAL_PARAMS[id];
    m = new MeshStandardMaterial({
      color: p.color,
      roughness: p.roughness,
      metalness: p.metalness,
      emissive: p.emissive ?? "#000000",
      emissiveIntensity: p.emissiveIntensity ?? 1,
      transparent: p.opacity !== undefined,
      opacity: p.opacity ?? 1,
      side: p.opacity !== undefined ? DoubleSide : FrontSide,
      depthWrite: p.opacity === undefined,
    });
    const set = TEXTURE_SETS[id];
    if (textured && set) {
      applyTriplanar(m, set);
      if (set.useColor) m.color.lerp(new Color("#ffffff"), 0.6); // the albedo map carries the colour; the old flat colour is only a tint
    }
    cache.set(key, m);
  }
  return m;
}
