import type { Vector3 } from "three";

export type WeatherPreset = "calm" | "breeze" | "gusty";

export interface WindParams {
  /** Mean wind speed, m/s. */
  mean: number;
  /** Direction the wind blows TOWARD, degrees clockwise from -Z (north) seen from above. */
  headingDeg: number;
  /** Gust amplitude, m/s. */
  gust: number;
}

export const WEATHER_PRESETS: Record<WeatherPreset, WindParams> = {
  calm: { mean: 0, headingDeg: 0, gust: 0 },
  breeze: { mean: 3, headingDeg: 70, gust: 1 },
  gusty: { mean: 5, headingDeg: 70, gust: 4 },
};

export function parseWeather(v: string | undefined): WeatherPreset {
  return v === "breeze" || v === "gusty" ? v : "calm";
}

/**
 * Deterministic wind: constant mean plus gusts built from incommensurate sine waves (smooth, bounded by `gust`,
 * repeatable for a given time). A cheap stand-in for turbulence; it is NOT a validated atmospheric model.
 */
export class WindModel {
  constructor(readonly params: WindParams) {}

  sample(t: number, out: Vector3): Vector3 {
    const { mean, headingDeg, gust } = this.params;
    const h = (headingDeg * Math.PI) / 180;
    const dx = Math.sin(h);
    const dz = -Math.cos(h);
    const g1 = Math.sin(t * 0.7) * 0.55 + Math.sin(t * 1.9 + 1.3) * 0.3 + Math.sin(t * 4.3 + 0.4) * 0.15;
    const g2 = Math.sin(t * 0.9 + 2.0) * 0.6 + Math.sin(t * 2.7 + 0.7) * 0.4;
    const along = mean + gust * g1;
    const across = gust * 0.5 * g2;
    out.set(dx * along + -dz * across, gust * 0.25 * Math.sin(t * 1.3 + 0.2), dz * along + dx * across);
    return out;
  }

  /** Largest possible speed magnitude, for UI/limits. */
  get maxSpeed(): number {
    return this.params.mean + this.params.gust * 1.1;
  }
}
