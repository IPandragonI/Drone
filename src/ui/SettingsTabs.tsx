"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "@/config/gameSettings";
import { loadGameSettings, saveGameSettings } from "@/storage/gameSettings";
import { ControllerSettings } from "./ControllerSettings";

type Tab = "controls" | "audio" | "graphics" | "camera" | "accessibility";
const TABS: Tab[] = ["controls", "audio", "graphics", "camera", "accessibility"];

function Slider({ label, value, min, max, step, format, onChange, testId }: { label: string; value: number; min: number; max: number; step: number; format?: (v: number) => string; onChange: (v: number) => void; testId?: string }) {
  return (
    <label className="block text-[11px] uppercase tracking-[0.15em] text-white/60">
      {label} <span className="font-mono text-white/80">{format ? format(value) : value.toFixed(2)}</span>
      <input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 block w-full accent-amber-400" />
    </label>
  );
}

function Toggle({ label, value, onChange, testId }: { label: string; value: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-white/70">
      <input data-testid={testId} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-amber-400" />
      {label}
    </label>
  );
}

/** Settings hub: controller (Phase 2) plus audio, graphics, camera and accessibility (auto-saved to IndexedDB). */
export function SettingsTabs() {
  const [tab, setTab] = useState<Tab>("controls");
  const [gs, setGs] = useState<GameSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const audio = useRef<AudioEngine | null>(null);

  useEffect(() => {
    loadGameSettings().then(setGs);
    return () => audio.current?.dispose();
  }, []);

  const update = (fn: (s: GameSettings) => void) => {
    if (!gs) return;
    const next = structuredClone(gs);
    fn(next);
    setGs(next);
    audio.current?.setSettings(next.audio);
    setSaved(false);
    saveGameSettings(next).then(() => setSaved(true));
  };

  const testSound = async () => {
    if (!gs) return;
    audio.current ??= new AudioEngine(gs.audio);
    await audio.current.start();
    audio.current.setSettings(gs.audio);
    audio.current.update([0.5, 0.5, 0.5, 0.5], true);
    audio.current.playImpact("moderate");
    setTimeout(() => audio.current?.update([0, 0, 0, 0], false), 900);
  };

  const g = gs ?? DEFAULT_GAME_SETTINGS;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="mx-auto max-w-3xl px-6 pt-10 text-white">
      <div className="mb-4 flex items-baseline justify-between border-b border-white/15 pb-3">
        <h1 className="text-2xl font-semibold uppercase tracking-tight">Settings</h1>
        <div className="flex items-baseline gap-4">
          {tab !== "controls" && (
            <span data-testid="gs-saved" className="font-mono text-[11px] uppercase tracking-[0.15em] text-emerald-400">
              {saved ? "Saved" : ""}
            </span>
          )}
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-white/60 hover:text-white">
            Back
          </Link>
        </div>
      </div>
      <div role="tablist" className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`border px-3 py-1.5 text-xs uppercase tracking-[0.15em] ${tab === t ? "border-amber-400 bg-amber-400 text-black" : "border-white/20 text-white/70 hover:border-white/50"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "controls" && <ControllerSettings embedded />}

      {tab !== "controls" && !gs && <div className="font-mono text-sm text-white/60">LOADING</div>}

      {gs && tab === "audio" && (
        <div className="space-y-5">
          <Toggle testId="audio-muted" label="Mute all" value={g.audio.muted} onChange={(v) => update((s) => (s.audio.muted = v))} />
          <Slider testId="audio-master" label="Master volume" value={g.audio.master} min={0} max={1} step={0.05} format={pct} onChange={(v) => update((s) => (s.audio.master = v))} />
          <Slider label="Motor volume" value={g.audio.engine} min={0} max={1} step={0.05} format={pct} onChange={(v) => update((s) => (s.audio.engine = v))} />
          <Slider label="Impact volume" value={g.audio.effects} min={0} max={1} step={0.05} format={pct} onChange={(v) => update((s) => (s.audio.effects = v))} />
          <button onClick={testSound} className="border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.15em] hover:border-white">
            Test sound
          </button>
          <p className="text-xs text-white/45">Sound is synthesised in the browser (placeholder, no recorded samples). It starts after your first key press in flight.</p>
        </div>
      )}

      {gs && tab === "graphics" && (
        <div className="space-y-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Default quality</div>
          <div className="flex gap-2">
            {(["low", "medium", "high"] as const).map((q) => (
              <button
                key={q}
                data-testid={`quality-${q}`}
                onClick={() => update((s) => (s.graphics.quality = q))}
                className={`border px-4 py-2 text-xs uppercase tracking-[0.15em] ${g.graphics.quality === q ? "border-amber-400 bg-amber-400 text-black" : "border-white/20 text-white/70"}`}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/45">Low: no shadows, 2 lights. Medium: soft shadows, 5 lights. High: larger shadow maps, 8 lights, full pixel density. The Start screen can override it per flight.</p>
        </div>
      )}

      {gs && tab === "camera" && (
        <div className="space-y-5">
          <Toggle testId="fov-custom" label="Custom FPV field of view" value={g.camera.fpvFov !== null} onChange={(v) => update((s) => (s.camera.fpvFov = v ? 100 : null))} />
          {g.camera.fpvFov !== null && <Slider testId="fov" label="FPV field of view" value={g.camera.fpvFov} min={60} max={150} step={1} format={(v) => `${v.toFixed(0)}°`} onChange={(v) => update((s) => (s.camera.fpvFov = v))} />}
          <Slider label="Camera vibration" value={g.camera.vibration} min={0} max={1} step={0.05} format={pct} onChange={(v) => update((s) => (s.camera.vibration = v))} />
          <Slider label="Chase camera distance" value={g.camera.chaseDistanceScale} min={0.5} max={2} step={0.05} format={(v) => `x${v.toFixed(2)}`} onChange={(v) => update((s) => (s.camera.chaseDistanceScale = v))} />
        </div>
      )}

      {gs && tab === "accessibility" && (
        <div className="space-y-5">
          <Toggle testId="a11y-flash" label="Reduce screen flashes on impact" value={g.accessibility.reduceFlashes} onChange={(v) => update((s) => (s.accessibility.reduceFlashes = v))} />
          <Toggle testId="a11y-contrast" label="High-contrast HUD" value={g.accessibility.highContrastHud} onChange={(v) => update((s) => (s.accessibility.highContrastHud = v))} />
          <Toggle testId="a11y-minimap" label="Show minimap" value={g.accessibility.showMinimap} onChange={(v) => update((s) => (s.accessibility.showMinimap = v))} />
          <Slider testId="a11y-hudscale" label="HUD size" value={g.accessibility.hudScale} min={0.75} max={1.75} step={0.05} format={(v) => `x${v.toFixed(2)}`} onChange={(v) => update((s) => (s.accessibility.hudScale = v))} />
        </div>
      )}
    </div>
  );
}
