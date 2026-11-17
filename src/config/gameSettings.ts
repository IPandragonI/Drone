import type { GraphicsQuality } from "./graphics";

export interface GameSettings {
  audio: { master: number; engine: number; effects: number; muted: boolean };
  graphics: { quality: GraphicsQuality };
  camera: {
    /** FPV field of view in degrees; null = use the drone's default. */
    fpvFov: number | null;
    /** 0 disables camera vibration, 1 = drone default. */
    vibration: number;
    /** Multiplier on the chase camera distance. */
    chaseDistanceScale: number;
  };
  accessibility: { reduceFlashes: boolean; hudScale: number; highContrastHud: boolean; showMinimap: boolean };
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  audio: { master: 0.7, engine: 0.8, effects: 0.8, muted: false },
  graphics: { quality: "medium" },
  camera: { fpvFov: null, vibration: 1, chaseDistanceScale: 1 },
  accessibility: { reduceFlashes: false, hudScale: 1, highContrastHud: false, showMinimap: true },
};

const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

/** Validate stored data: anything missing or out of range falls back to defaults / is clamped. */
export function mergeGameSettings(raw: unknown): GameSettings {
  const d = DEFAULT_GAME_SETTINGS;
  const r = obj(raw);
  const a = obj(r.audio);
  const g = obj(r.graphics);
  const c = obj(r.camera);
  const x = obj(r.accessibility);
  return {
    audio: {
      master: num(a.master, 0, 1, d.audio.master),
      engine: num(a.engine, 0, 1, d.audio.engine),
      effects: num(a.effects, 0, 1, d.audio.effects),
      muted: bool(a.muted, d.audio.muted),
    },
    graphics: { quality: g.quality === "low" || g.quality === "medium" || g.quality === "high" ? g.quality : d.graphics.quality },
    camera: {
      fpvFov: c.fpvFov === null || c.fpvFov === undefined ? null : num(c.fpvFov, 60, 150, 100),
      vibration: num(c.vibration, 0, 1, d.camera.vibration),
      chaseDistanceScale: num(c.chaseDistanceScale, 0.5, 2, d.camera.chaseDistanceScale),
    },
    accessibility: {
      reduceFlashes: bool(x.reduceFlashes, d.accessibility.reduceFlashes),
      hudScale: num(x.hudScale, 0.75, 1.75, d.accessibility.hudScale),
      highContrastHud: bool(x.highContrastHud, d.accessibility.highContrastHud),
      showMinimap: bool(x.showMinimap, d.accessibility.showMinimap),
    },
  };
}
