import { describe, expect, it } from "vitest";
import { FPV_FREESTYLE } from "./drones";
import { QWERTY_KEY_BINDINGS, DEFAULT_KEY_BINDINGS, bindingConflicts, bindingsFor } from "./controls";
import { mergeControlSettings } from "./controlSettings";
import { applyTuning, mergeTuning } from "./tuning";

describe("drone tuning", () => {
  it("clamps out-of-range values and drops invalid ones", () => {
    const t = mergeTuning({ maxRatesDegS: { roll: 99999, pitch: 5, yaw: 300 }, rateExpo: 2, throttleExpo: "x", angleGain: 0, maxTiltDeg: 200 });
    expect(t.maxRatesDegS).toEqual({ roll: 1200, pitch: 40, yaw: 300 });
    expect(t.rateExpo).toBe(1);
    expect(t.throttleExpo).toBeUndefined();
    expect(t.angleGain).toBe(2);
    expect(t.maxTiltDeg).toBe(70);
    expect(mergeTuning(null)).toEqual({});
    expect(mergeTuning({ maxRatesDegS: { roll: 100 } })).toEqual({}); // partial rates are ignored
  });

  it("applies to a copy and leaves the original drone untouched", () => {
    const before = structuredClone(FPV_FREESTYLE.physics);
    const tuned = applyTuning(FPV_FREESTYLE, { rateExpo: 0.6, maxRatesDegS: { roll: 500, pitch: 500, yaw: 300 } });
    expect(tuned.physics.rateExpo).toBe(0.6);
    expect(tuned.physics.maxRatesDegS.roll).toBe(500);
    expect(tuned.physics.angleGain).toBe(FPV_FREESTYLE.physics.angleGain); // untouched fields keep the drone default
    expect(FPV_FREESTYLE.physics).toEqual(before);
    expect(applyTuning(FPV_FREESTYLE, undefined)).toBe(FPV_FREESTYLE);
  });

  it("is validated when loaded from stored settings", () => {
    const s = mergeControlSettings({ droneTuning: { "fpv-freestyle": { rateExpo: 0.5 }, junk: "x" }, keyboard: { layout: "weird", overrides: { pitchForward: ["i"] } } });
    expect(s.droneTuning["fpv-freestyle"]).toEqual({ rateExpo: 0.5 });
    expect(s.droneTuning.junk).toBeUndefined();
    expect(s.keyboard.layout).toBe("auto");
  });
});

describe("keyboard bindings", () => {
  it("QWERTY defaults use WASD and differ from AZERTY only in the movement keys", () => {
    expect(QWERTY_KEY_BINDINGS.pitchForward).toEqual(["w"]);
    expect(DEFAULT_KEY_BINDINGS.pitchForward).toEqual(["z"]);
    expect(QWERTY_KEY_BINDINGS.throttleUp).toEqual(DEFAULT_KEY_BINDINGS.throttleUp);
    expect(bindingConflicts(QWERTY_KEY_BINDINGS)).toEqual([]);
    expect(bindingConflicts(DEFAULT_KEY_BINDINGS)).toEqual([]);
  });

  it("applies valid overrides, rejects reserved and malformed keys, and reports conflicts", () => {
    const b = bindingsFor("qwerty", { pitchForward: ["I"], pause: ["f1"], reset: [42], rollLeft: ["toolongkeyname123"], bogus: ["x"] });
    expect(b.pitchForward).toEqual(["i"]);
    expect(b.pause).toEqual(QWERTY_KEY_BINDINGS.pause); // F1 is reserved
    expect(b.reset).toEqual(QWERTY_KEY_BINDINGS.reset);
    expect(b.rollLeft).toEqual(QWERTY_KEY_BINDINGS.rollLeft);
    const c = bindingsFor("qwerty", { reset: ["w"] });
    expect(bindingConflicts(c).length).toBe(1);
    expect(bindingsFor("azerty", null)).toEqual(DEFAULT_KEY_BINDINGS);
  });
});
