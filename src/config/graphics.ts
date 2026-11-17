export type GraphicsQuality = "low" | "medium" | "high";

export interface GraphicsPreset {
  shadows: boolean;
  shadowMapSize: number;
  maxDpr: number;
  antialias: boolean;
  fog: boolean;
  /** Max point lights enabled in the scene. */
  maxPointLights: number;
  /** PBR texture sets (triplanar) instead of flat colours. */
  textures: boolean;
  /** Procedural clouds and sky detail. */
  clouds: boolean;
  /** Image-based lighting from the sky. */
  ibl: boolean;
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  low: { shadows: false, shadowMapSize: 512, maxDpr: 1, antialias: false, fog: true, maxPointLights: 2, textures: false, clouds: false, ibl: false },
  medium: { shadows: true, shadowMapSize: 1024, maxDpr: 1.5, antialias: true, fog: true, maxPointLights: 5, textures: true, clouds: true, ibl: false },
  high: { shadows: true, shadowMapSize: 2048, maxDpr: 2, antialias: true, fog: true, maxPointLights: 8, textures: true, clouds: true, ibl: true },
};

export function parseQuality(v: string | undefined): GraphicsQuality {
  return v === "low" || v === "high" ? v : "medium";
}
