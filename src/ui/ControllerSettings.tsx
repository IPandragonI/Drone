"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONTROL_SETTINGS, type ControlSettings, type GamepadProfile } from "@/config/controlSettings";
import { CalibrationRecorder, readSticks } from "@/sim/input/gamepad";
import type { AxisShaping } from "@/sim/input/normalize";
import { loadControlSettings, saveControlSettings } from "@/storage/settings";

type Channel = "roll" | "pitch" | "yaw" | "throttle";
const CHANNELS: Channel[] = ["roll", "pitch", "yaw", "throttle"];
type Phase = "idle" | "center" | "range";

function firstPad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p) return p;
  return null;
}

export function ControllerSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const [settings, setSettings] = useState<ControlSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [padName, setPadName] = useState<string | null>(null);
  const [live, setLive] = useState<Record<Channel, number>>({ roll: 0, pitch: 0, yaw: 0, throttle: 0 });
  const [phase, setPhase] = useState<Phase>("idle");
  const [calMsg, setCalMsg] = useState("");
  const recorder = useRef<CalibrationRecorder | null>(null);
  const settingsRef = useRef<ControlSettings | null>(null);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    loadControlSettings().then((s) => {
      setSettings(s);
    });
  }, []);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Poll the pad ~30 Hz for the live display and calibration recording.
  useEffect(() => {
    const id = window.setInterval(() => {
      const pad = firstPad();
      setPadName(pad ? pad.id : null);
      const s = settingsRef.current;
      if (!pad || !s) return;
      if (phaseRef.current === "center") recorder.current?.addCenterSample(pad.axes);
      if (phaseRef.current === "range") recorder.current?.addRangeSample(pad.axes);
      const sticks = readSticks(pad.axes, s.gamepad);
      setLive({ roll: sticks.roll, pitch: sticks.pitch, yaw: sticks.yaw, throttle: sticks.throttleStick });
    }, 33);
    return () => window.clearInterval(id);
  }, []);

  if (!settings) return <div className="p-8 font-mono text-sm text-white/60">LOADING</div>;
  const g = settings.gamepad;
  const update = (fn: (p: GamepadProfile) => void) => {
    const next = structuredClone(settings);
    fn(next.gamepad);
    setSettings(next);
    setSaved(false);
  };
  const shaping = (c: Channel, patch: Partial<AxisShaping>) => update((p) => Object.assign(p[c], patch));

  const startCalibration = () => {
    recorder.current = new CalibrationRecorder(g.axisMap);
    setCalMsg("Release all sticks to centre. Recording...");
    setPhase("center");
    window.setTimeout(() => {
      setPhase("range");
      setCalMsg("Now rotate both sticks through their full range, then press Finish.");
    }, 1200);
  };
  const finishCalibration = () => {
    const res = recorder.current?.result() ?? null;
    setPhase("idle");
    if (!res) {
      setCalMsg("Calibration failed: every stick axis must be moved to both extremes. Try again.");
      return;
    }
    update((p) => {
      p.calibration = res;
    });
    setCalMsg("Calibration captured. Press Save to keep it.");
  };

  const label = "font-mono text-[11px] uppercase tracking-[0.2em] text-white/50";
  const btn = "border border-white/25 px-4 py-2 text-xs uppercase tracking-[0.15em] hover:border-white/60";

  return (
    <div className={embedded ? "text-white" : "mx-auto max-w-3xl px-6 py-10 text-white"}>
      {!embedded && (
        <div className="mb-8 flex items-baseline justify-between border-b border-white/15 pb-3">
          <h1 className="text-2xl font-semibold uppercase tracking-tight">Settings / Controller</h1>
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-white/60 hover:text-white">
            Back
          </Link>
        </div>
      )}

      <section className="mb-8">
        <div className={label}>Device</div>
        <div data-testid="pad-name" className="mt-1 text-sm text-white/80">
          {padName ?? "No gamepad detected. Connect a controller and move a stick."}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-4">
          {CHANNELS.map((c) => (
            <div key={c}>
              <div className={label}>{c}</div>
              <div className="relative mt-1 h-2 bg-white/15">
                <div className="absolute inset-y-0 w-[3px] bg-amber-400" style={{ left: `${(live[c] + 1) * 50}%` }} />
              </div>
              <div data-testid={`live-${c}`} className="mt-1 font-mono text-xs tabular-nums text-white/60">{live[c].toFixed(2)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid grid-cols-2 gap-6">
        <div>
          <div className={label}>Stick mode</div>
          <div className="mt-2 flex gap-2">
            {([1, 2] as const).map((m) => (
              <button key={m} onClick={() => update((p) => (p.stickMode = m))} className={`${btn} ${g.stickMode === m ? "border-amber-400 bg-amber-400 text-black" : ""}`}>
                Mode {m}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-white/45">
            {g.stickMode === 2 ? "Left: throttle + yaw. Right: pitch + roll." : "Left: pitch + yaw. Right: throttle + roll."}
          </div>
        </div>
        <div>
          <div className={label}>Throttle behaviour</div>
          <div className="mt-2 flex gap-2">
            {(["integrate", "absolute"] as const).map((m) => (
              <button key={m} onClick={() => update((p) => (p.throttleMode = m))} className={`${btn} ${g.throttleMode === m ? "border-amber-400 bg-amber-400 text-black" : ""}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-white/45">Integrate suits self-centring sticks. Absolute suits a radio-style throttle.</div>
        </div>
      </section>

      <section className="mb-8">
        <div className={label}>Calibration</div>
        <div className="mt-2 flex items-center gap-3">
          <button disabled={!padName || phase !== "idle"} onClick={startCalibration} className={`${btn} disabled:opacity-40`}>
            Calibrate
          </button>
          {phase === "range" && (
            <button onClick={finishCalibration} className={`${btn} border-amber-400`}>
              Finish
            </button>
          )}
          <span data-testid="cal-msg" className="text-xs text-white/60">{calMsg}</span>
        </div>
      </section>

      <section className="mb-8 space-y-5">
        {CHANNELS.map((c) => (
          <div key={c} className="grid grid-cols-[80px_1fr_1fr_1fr_auto] items-center gap-4">
            <div className={label}>{c}</div>
            <Slider name="Deadzone" v={g[c].deadzone} min={0} max={0.5} step={0.01} on={(v) => shaping(c, { deadzone: v })} />
            <Slider name="Expo" v={g[c].expo} min={0} max={1} step={0.05} on={(v) => shaping(c, { expo: v })} />
            <Slider name="Sensitivity" v={g[c].sensitivity} min={0.2} max={2} step={0.05} on={(v) => shaping(c, { sensitivity: v })} />
            <label className="flex items-center gap-2 text-xs text-white/70">
              <input type="checkbox" checked={g[c].invert} onChange={(e) => shaping(c, { invert: e.target.checked })} />
              Invert
            </label>
          </div>
        ))}
      </section>

      <div className="flex gap-3">
        <button
          onClick={async () => {
            const latest = await loadControlSettings(); // keep keyboard bindings and tuning saved elsewhere on this page
            latest.gamepad = settings.gamepad;
            await saveControlSettings(latest);
            setSaved(true);
          }}
          className="bg-white px-6 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black hover:bg-amber-400"
        >
          Save
        </button>
        <button
          onClick={() => {
            setSettings(structuredClone(DEFAULT_CONTROL_SETTINGS));
            setSaved(false);
          }}
          className={btn}
        >
          Defaults
        </button>
        <span data-testid="saved" className="self-center text-xs text-white/60">{saved ? "Saved" : ""}</span>
      </div>
    </div>
  );
}

function Slider({ name, v, min, max, step, on }: { name: string; v: number; min: number; max: number; step: number; on: (v: number) => void }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.15em] text-white/45">
      {name} <span className="font-mono text-white/70">{v.toFixed(2)}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="mt-1 block w-full accent-amber-400" />
    </label>
  );
}
