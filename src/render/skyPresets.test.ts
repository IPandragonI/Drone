import { describe, expect, it } from "vitest";
import { ATMOSPHERES, SKY_IDS, parseSky, skyColors, sunDirection } from "./skyPresets";

describe("sky presets", () => {
  it("sun direction is a unit vector, up when elevated, and follows azimuth (north = -Z, east = +X)", () => {
    for (const [e, a] of [[48, 135], [7, 250], [90, 0], [0, 90]] as const) {
      const d = sunDirection(e, a);
      expect(Math.hypot(...d)).toBeCloseTo(1, 6);
      expect(d[1]).toBeCloseTo(Math.sin((e * Math.PI) / 180), 6);
    }
    const north = sunDirection(0, 0);
    expect(north[2]).toBeCloseTo(-1, 6);
    const east = sunDirection(0, 90);
    expect(east[0]).toBeCloseTo(1, 6);
  });

  it("sky colours stay in range, warm toward the horizon sun and blue when high", () => {
    for (const e of [0, 5, 15, 30, 60, 90]) {
      const c = skyColors(e);
      for (const rgb of [c.zenith, c.horizon, c.sun, c.fog]) for (const v of rgb) expect(v >= 0 && v <= 1).toBe(true);
    }
    const dusk = skyColors(5);
    const noon = skyColors(60);
    expect(dusk.horizon[0]).toBeGreaterThan(dusk.horizon[2]); // red > blue at golden hour
    expect(noon.zenith[2]).toBeGreaterThan(noon.zenith[0]); // blue zenith at noon
  });

  it("every preset is complete and sane, and fog gets denser as visibility drops", () => {
    for (const id of SKY_IDS) {
      const p = ATMOSPHERES[id];
      expect(p.id).toBe(id);
      expect(p.cloudCover).toBeGreaterThanOrEqual(0);
      expect(p.cloudCover).toBeLessThanOrEqual(1);
      expect(p.sunElevationDeg).toBeGreaterThan(0);
      expect(p.fogFar).toBeGreaterThan(50);
      expect(p.exposure).toBeGreaterThan(0.5);
    }
    expect(ATMOSPHERES.foggy.fogFar).toBeLessThan(ATMOSPHERES.overcast.fogFar);
    expect(ATMOSPHERES.overcast.sunIntensity).toBeLessThan(ATMOSPHERES.clear.sunIntensity);
  });

  it("parseSky falls back on unknown input", () => {
    expect(parseSky("dusk")).toBe("dusk");
    expect(parseSky("nonsense")).toBe("clear");
    expect(parseSky(undefined, "cloudy")).toBe("cloudy");
  });
});
