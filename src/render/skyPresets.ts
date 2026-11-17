export type SkyId = "clear" | "cloudy" | "overcast" | "dusk" | "foggy";

export interface AtmospherePreset {
  id: SkyId;
  label: string;
  /** Sun height above the horizon, degrees. */
  sunElevationDeg: number;
  /** Sun direction, degrees clockwise from -Z (north) seen from above. */
  sunAzimuthDeg: number;
  /** 0 = clear, 1 = solid overcast. */
  cloudCover: number;
  /** Horizon haze 0..1 (blends the sky into the fog colour). */
  haze: number;
  /** Outdoor fog distance, m (indoor maps keep their own fog). */
  fogFar: number;
  /** Renderer tone-mapping exposure. */
  exposure: number;
  /** Direct sun light intensity. */
  sunIntensity: number;
  /** Hemisphere (sky) light intensity. */
  ambient: number;
}

/** Data-driven: adding "night" or "storm" later means adding an entry here, not new code. */
export const ATMOSPHERES: Record<SkyId, AtmospherePreset> = {
  clear: { id: "clear", label: "Clear", sunElevationDeg: 48, sunAzimuthDeg: 135, cloudCover: 0.22, haze: 0.35, fogFar: 700, exposure: 0.95, sunIntensity: 3.0, ambient: 0.9 },
  cloudy: { id: "cloudy", label: "Cloudy", sunElevationDeg: 38, sunAzimuthDeg: 120, cloudCover: 0.62, haze: 0.5, fogFar: 500, exposure: 0.95, sunIntensity: 1.7, ambient: 1.15 },
  overcast: { id: "overcast", label: "Overcast", sunElevationDeg: 30, sunAzimuthDeg: 120, cloudCover: 0.95, haze: 0.65, fogFar: 380, exposure: 0.95, sunIntensity: 0.6, ambient: 1.45 },
  dusk: { id: "dusk", label: "Golden hour", sunElevationDeg: 7, sunAzimuthDeg: 250, cloudCover: 0.4, haze: 0.55, fogFar: 520, exposure: 0.9, sunIntensity: 2.4, ambient: 0.7 },
  foggy: { id: "foggy", label: "Fog", sunElevationDeg: 25, sunAzimuthDeg: 120, cloudCover: 0.85, haze: 0.9, fogFar: 110, exposure: 0.95, sunIntensity: 0.5, ambient: 1.4 },
};

export const SKY_IDS = Object.keys(ATMOSPHERES) as SkyId[];

export function parseSky(v: string | undefined, fallback: SkyId = "clear"): SkyId {
  return v && v in ATMOSPHERES ? (v as SkyId) : fallback;
}

/** Unit vector toward the sun (Y up, -Z north, azimuth clockwise from north). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Sky colours (linear-ish RGB 0..1) as a function of sun height: blue day, warm dusk. */
export function skyColors(sunElevationDeg: number): { zenith: RGB; horizon: RGB; sun: RGB; fog: RGB } {
  const t = smooth(0, 30, sunElevationDeg); // 0 = at the horizon, 1 = high sun
  const zenith = mix([0.1, 0.14, 0.3], [0.2, 0.42, 0.8], t);
  const horizon = mix([1.0, 0.55, 0.32], [0.68, 0.8, 0.93], t);
  const sun = mix([1.0, 0.62, 0.32], [1.0, 0.96, 0.88], t);
  return { zenith, horizon, sun, fog: mix(horizon, [0.72, 0.78, 0.84], 0.4) };
}
