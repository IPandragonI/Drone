import { describe, expect, it } from "vitest";
import { engineLevel, impactLevel, rotorHz } from "@/audio/model";
import { DEFAULT_GAME_SETTINGS, mergeGameSettings } from "./gameSettings";

describe("mergeGameSettings", () => {
  it("returns defaults for garbage", () => {
    expect(mergeGameSettings(undefined)).toEqual(DEFAULT_GAME_SETTINGS);
    expect(mergeGameSettings("x")).toEqual(DEFAULT_GAME_SETTINGS);
    expect(mergeGameSettings({ audio: 5, camera: null })).toEqual(DEFAULT_GAME_SETTINGS);
  });
  it("clamps out-of-range and ignores wrong types", () => {
    const s = mergeGameSettings({
      audio: { master: 9, engine: -1, effects: "loud", muted: "yes" },
      graphics: { quality: "ultra" },
      camera: { fpvFov: 500, vibration: 0.3, chaseDistanceScale: 0 },
      accessibility: { hudScale: 10, reduceFlashes: true },
    });
    expect(s.audio).toEqual({ master: 1, engine: 0, effects: DEFAULT_GAME_SETTINGS.audio.effects, muted: false });
    expect(s.graphics.quality).toBe("medium");
    expect(s.camera).toEqual({ fpvFov: 150, vibration: 0.3, chaseDistanceScale: 0.5 });
    expect(s.accessibility.hudScale).toBe(1.75);
    expect(s.accessibility.reduceFlashes).toBe(true);
  });
  it("keeps valid values and null fov", () => {
    const s = mergeGameSettings({ camera: { fpvFov: 120 }, graphics: { quality: "high" } });
    expect(s.camera.fpvFov).toBe(120);
    expect(s.graphics.quality).toBe("high");
    expect(mergeGameSettings({ camera: { fpvFov: null } }).camera.fpvFov).toBeNull();
  });
});

describe("audio model", () => {
  it("rotor pitch and loudness rise monotonically and stay bounded", () => {
    let prevF = -1;
    let prevL = -1;
    for (let s = 0; s <= 1.0001; s += 0.1) {
      expect(rotorHz(s)).toBeGreaterThan(prevF);
      expect(engineLevel(s)).toBeGreaterThan(prevL);
      prevF = rotorHz(s);
      prevL = engineLevel(s);
    }
    expect(rotorHz(-3)).toBe(rotorHz(0));
    expect(rotorHz(9)).toBe(rotorHz(1));
    expect(engineLevel(0)).toBeGreaterThan(0);
    expect(engineLevel(1)).toBeLessThanOrEqual(1);
  });
  it("impacts scale with severity and none is silent", () => {
    expect(impactLevel("none")).toBe(0);
    expect(impactLevel("minor")).toBeLessThan(impactLevel("moderate"));
    expect(impactLevel("severe")).toBeLessThan(impactLevel("critical"));
  });
});
