"use client";

import { useEffect, useMemo, useState } from "react";
import { KEY_ACTIONS, KEY_ACTION_LABELS, RESERVED_KEYS, bindingConflicts, bindingsFor, type KeyAction, type KeyboardLayout } from "@/config/controls";
import type { ControlSettings } from "@/config/controlSettings";
import { DRONE_LIST } from "@/config/drones";
import { TUNING_LIMITS, applyTuning, type DroneTuning } from "@/config/tuning";
import { shapeStick, throttleCurve } from "@/sim/flight/controller";
import { detectLayout } from "@/sim/input/layout";
import { loadControlSettings, saveControlSettings } from "@/storage/settings";
import { keyLabel } from "./FlightOverlays";

/** Read-modify-write against the latest stored settings, so panels on the same page never overwrite each other. */
async function update(fn: (s: ControlSettings) => void): Promise<ControlSettings> {
  const latest = await loadControlSettings();
  fn(latest);
  await saveControlSettings(latest);
  return latest;
}

const btn = "border border-white/30 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] hover:border-white";

/** Keyboard layout and key rebinding. Esc cancels a capture; F1/F3/? are reserved for the interface. */
export function KeyBindingsPanel() {
  const [s, setS] = useState<ControlSettings | null>(null);
  const [detected, setDetected] = useState<KeyboardLayout>("qwerty");
  const [listening, setListening] = useState<KeyAction | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    loadControlSettings().then(setS);
    detectLayout().then(setDetected);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const k = e.key.toLowerCase();
      if (k === "escape") {
        setListening(null);
        return;
      }
      if (RESERVED_KEYS.includes(k)) {
        setNote(`${keyLabel(e.key)} is reserved for the interface. Pick another key.`);
        return;
      }
      void update((c) => (c.keyboard.overrides[listening] = [k])).then((c) => {
        setS(c);
        setNote("");
      });
      setListening(null);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [listening]);

  const layout: KeyboardLayout = !s ? detected : s.keyboard.layout === "auto" ? detected : s.keyboard.layout;
  const bindings = useMemo(() => bindingsFor(layout, s?.keyboard.overrides), [layout, s]);
  const conflicts = bindingConflicts(bindings);
  if (!s) return null;

  return (
    <section data-testid="keybindings" className="mt-12 border-t border-white/15 pt-8 text-white">
      <h2 className="text-lg font-semibold uppercase tracking-tight">Keyboard</h2>
      <p className="mt-1 text-sm text-white/55">Defaults follow your keyboard layout. Click Rebind, then press the key you want (Esc cancels).</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Layout</span>
        {(["auto", "azerty", "qwerty"] as const).map((l) => (
          <button
            key={l}
            data-testid={`layout-${l}`}
            onClick={() => void update((c) => (c.keyboard.layout = l)).then(setS)}
            className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] ${s.keyboard.layout === l ? "border-amber-400 bg-amber-400 text-black" : "border-white/25 text-white/70"}`}
          >
            {l === "auto" ? `Auto (${detected})` : l}
          </button>
        ))}
        <button data-testid="bindings-reset" onClick={() => void update((c) => (c.keyboard.overrides = {})).then(setS)} className={`${btn} ml-auto`}>
          Reset all
        </button>
      </div>
      {note && <p className="mt-3 text-xs text-amber-300">{note}</p>}
      {conflicts.length > 0 && (
        <p data-testid="binding-conflict" className="mt-3 text-xs text-red-300">
          Conflict: {conflicts.map(([k, a, b]) => `${keyLabel(k)} is used by both ${KEY_ACTION_LABELS[a]} and ${KEY_ACTION_LABELS[b]}`).join("; ")}
        </p>
      )}
      <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {KEY_ACTIONS.map((a) => (
          <div key={a} className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-sm">
            <span className="text-white/75">{KEY_ACTION_LABELS[a]}</span>
            <span className="flex items-center gap-2">
              <span data-testid={`keys-${a}`} className="min-w-16 text-right font-mono text-amber-200">
                {listening === a ? "press a key…" : bindings[a].map(keyLabel).join(" / ")}
              </span>
              <button data-testid={`rebind-${a}`} onClick={() => setListening(listening === a ? null : a)} className={btn}>
                {listening === a ? "Cancel" : "Rebind"}
              </button>
              {s.keyboard.overrides[a] && (
                <button aria-label={`Reset ${KEY_ACTION_LABELS[a]}`} onClick={() => void update((c) => delete c.keyboard.overrides[a]).then(setS)} className="text-white/40 hover:text-white">
                  ↺
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Curve({ points, color, w = 220, h = 120 }: { points: Array<[number, number]>; color: string; w?: number; h?: number }) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${(x * w).toFixed(1)} ${(h - y * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full border border-white/15 bg-white/[0.03]" role="img">
      <path d={`M0 ${h / 2}H${w}M${w / 2} 0V${h}`} stroke="rgba(255,255,255,0.08)" fill="none" />
      <path d={d} stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}

function Slider({ label, value, min, max, step, unit = "", onChange, testId }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; testId?: string }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.15em] text-white/65">
      {label} <span className="font-mono text-white/90">{Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}{unit}</span>
      <input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 block w-full accent-amber-400" />
    </label>
  );
}

/** Per-drone rates, expo and self-levelling, with live curve previews. Applies from the next flight. */
export function TuningPanel() {
  const [s, setS] = useState<ControlSettings | null>(null);
  const [droneId, setDroneId] = useState(DRONE_LIST[0].id);
  useEffect(() => {
    loadControlSettings().then(setS);
  }, []);
  const base = DRONE_LIST.find((d) => d.id === droneId) ?? DRONE_LIST[0];
  const tuned = applyTuning(base, s?.droneTuning[droneId]);
  const p = tuned.physics;
  const isTuned = !!s && Object.keys(s.droneTuning[droneId] ?? {}).length > 0;

  const set = (patch: DroneTuning) => {
    void update((c) => {
      const cur = c.droneTuning[droneId] ?? {};
      c.droneTuning[droneId] = { ...cur, ...patch };
    }).then(setS);
  };
  const reset = () =>
    void update((c) => {
      delete c.droneTuning[droneId];
    }).then(setS);

  if (!s) return <div className="font-mono text-sm text-white/60">LOADING</div>;
  const maxRate = Math.max(p.maxRatesDegS.roll, p.maxRatesDegS.pitch);
  const rateCurve: Array<[number, number]> = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40;
    return [x, shapeStick(x, p.rateExpo)];
  });
  const throttle: Array<[number, number]> = Array.from({ length: 41 }, (_, i) => [i / 40, throttleCurve(i / 40, p.throttleExpo)]);

  return (
    <div data-testid="tuning" className="space-y-6 text-white">
      <div>
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Drone</div>
        <div className="flex flex-wrap gap-2">
          {DRONE_LIST.map((d) => (
            <button key={d.id} data-testid={`tune-${d.id}`} onClick={() => setDroneId(d.id)} className={`border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] ${d.id === droneId ? "border-amber-400 bg-amber-400 text-black" : "border-white/25 text-white/70"}`}>
              {d.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/50">
          {isTuned ? "Custom tuning active." : "Using the drone's defaults."} Changes apply from your next flight and are saved automatically.
        </p>
      </div>

      <div className="grid gap-8 sm:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Acro rates</div>
          {(["roll", "pitch", "yaw"] as const).map((ax) => (
            <Slider key={ax} testId={`rate-${ax}`} label={`${ax} max rate`} unit="°/s" value={p.maxRatesDegS[ax]} min={TUNING_LIMITS.rate[0]} max={TUNING_LIMITS.rate[1]} step={10} onChange={(v) => set({ maxRatesDegS: { ...p.maxRatesDegS, [ax]: v } })} />
          ))}
          <Slider testId="rate-expo" label="Stick expo" value={p.rateExpo} min={0} max={1} step={0.05} onChange={(v) => set({ rateExpo: v })} />
          <Slider testId="throttle-expo" label="Throttle expo" value={p.throttleExpo} min={0} max={1} step={0.05} onChange={(v) => set({ throttleExpo: v })} />
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Self-levelling (Angle / Horizon)</div>
          <Slider testId="angle-gain" label="Level strength" value={p.angleGain} min={TUNING_LIMITS.angleGain[0]} max={TUNING_LIMITS.angleGain[1]} step={0.5} onChange={(v) => set({ angleGain: v })} />
          <Slider testId="max-tilt" label="Max tilt" unit="°" value={p.maxTiltDeg} min={TUNING_LIMITS.maxTiltDeg[0]} max={TUNING_LIMITS.maxTiltDeg[1]} step={1} onChange={(v) => set({ maxTiltDeg: v })} />
          <button data-testid="tuning-reset" onClick={reset} className={btn}>
            Reset to defaults
          </button>
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Roll / pitch rate vs stick (full stick = {maxRate.toFixed(0)}°/s)</div>
            <Curve points={rateCurve} color="#ffb41f" />
          </div>
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Throttle curve (stick → thrust)</div>
            <Curve points={throttle} color="#4ade80" />
          </div>
          <p className="text-xs text-white/45">Higher rates turn the drone faster; expo softens the centre of the stick for fine control. Level strength changes how firmly Angle mode holds the horizon.</p>
        </div>
      </div>
    </div>
  );
}
