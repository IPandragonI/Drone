"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/audio/engine";
import { DRONES, FPV_FREESTYLE } from "@/config/drones";
import { DEFAULT_GAME_SETTINGS, type GameSettings } from "@/config/gameSettings";
import { parseQuality, type GraphicsQuality } from "@/config/graphics";
import { ENV_BY_ID, buildEnvironment } from "@/env/registry";
import { MISSION_BY_ID } from "@/missions/defs";
import { FlightScene } from "@/render/FlightScene";
import { FlightSession, type ViewState } from "@/sim/session";
import { Simulation } from "@/sim/simulation";
import { parseWeather } from "@/sim/wind";
import { parseSky, type SkyId } from "@/render/skyPresets";
import { loadControlSettings } from "@/storage/settings";
import { loadGameSettings } from "@/storage/gameSettings";
import { saveFlight, saveMissionResult } from "@/storage/progress";
import type { FlightMode, Telemetry } from "@/sim/types";
import { Hud } from "./Hud";
import { Minimap, type MapMarker } from "./Minimap";
import { MissionHud, MissionOverlay } from "./MissionHud";
import { PhonePanel } from "./PhonePanel";

export interface FlightViewProps {
  droneId?: string;
  mode?: string;
  quality?: string;
  env?: string;
  weather?: string;
  sky?: string;
  mission?: string;
  /** Expose the session on `window` for end-to-end tests. */
  debug?: boolean;
}

const MODES: FlightMode[] = ["angle", "horizon", "acro"];
const tmpTel: Telemetry = {
  speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0,
  motors: [0, 0, 0, 0], position: [0, 0, 0],
};

declare global {
  interface Window {
    __session?: FlightSession;
    __audio?: AudioEngine;
  }
}

/** Saves only what changed since the last call, so periodic flushes, mission end and page exit never double count. */
function makeFlusher(session: FlightSession): () => void {
  let saved = { time: 0, crashes: 0, collisions: 0 };
  let countedFlight = false;
  return () => {
    const t = session.getFlightTotals();
    const delta = { time: t.time - saved.time, crashes: t.crashes - saved.crashes, collisions: t.collisions - saved.collisions };
    if (delta.time <= 0 && delta.crashes === 0 && delta.collisions === 0) return;
    const flights = !countedFlight && t.time > 0 ? 1 : 0;
    if (flights) countedFlight = true;
    saved = t;
    void saveFlight({ ...delta, flights });
  };
}

export default function FlightView({ droneId, mode, quality, env: envId, weather, sky: skyParam, mission: missionId, debug }: FlightViewProps) {
  const [session, setSession] = useState<FlightSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState | null>(null);
  const [gs, setGs] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [weatherLabel, setWeatherLabel] = useState("calm");
  const flushRef = useRef<(() => void) | null>(null);
  const sky: SkyId = parseSky(skyParam, parseSky(ENV_BY_ID[(missionId ? MISSION_BY_ID[missionId]?.envId : envId) ?? ""]?.defaultSky, "cloudy"));
  const q: GraphicsQuality = quality ? parseQuality(quality) : gs.graphics.quality;

  useEffect(() => {
    let cancelled = false;
    let created: FlightSession | null = null;
    let flushTimer: number | undefined;
    const missionDef = missionId ? MISSION_BY_ID[missionId] : undefined;
    const drone = (missionDef ? DRONES[missionDef.droneId] : droneId && DRONES[droneId]) || FPV_FREESTYLE;
    const requested = MODES.find((m) => m === (missionDef?.mode ?? mode));
    const env = buildEnvironment(missionDef?.envId ?? envId);
    const wx = env.outdoor ? (missionDef?.weather ?? parseWeather(weather)) : "calm";
    Promise.all([
      Simulation.create({ env, drone, mode: requested && drone.flightModes.includes(requested) ? requested : drone.defaultMode }),
      loadControlSettings(),
      loadGameSettings(),
    ])
      .then(([sim, settings, game]) => {
        if (cancelled) {
          sim.dispose();
          return;
        }
        sim.setWeather(wx);
        created = new FlightSession(sim, settings);
        if (missionDef) {
          created.setMission(missionDef);
          created.onMissionEnd = (r) => void saveMissionResult(r);
        }
        created.attach(window);
        if (debug) window.__session = created;
        flushRef.current = makeFlusher(created);
        flushTimer = window.setInterval(() => flushRef.current?.(), 4000);
        const prevEnd = created.onMissionEnd;
        created.onMissionEnd = (r) => {
          prevEnd?.(r);
          flushRef.current?.();
        };
        setGs(game);
        setWeatherLabel(wx);
        setSession(created);
        setView(created.getViewState());
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    const persist = () => flushRef.current?.();
    window.addEventListener("pagehide", persist);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", persist);
      window.clearInterval(flushTimer);
      persist();
      flushRef.current = null;
      created?.dispose();
      setSession(null);
    };
  }, [droneId, mode, envId, weather, missionId, debug]);

  useEffect(() => {
    if (!session) return;
    const unsub = session.subscribe(setView);
    const onHide = () => session.suspend();
    const onVis = () => document.hidden && session.suspend();
    window.addEventListener("blur", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      unsub();
      window.removeEventListener("blur", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session]);

  // Audio: the context may only start after a user gesture; motors follow rotor speeds, impacts follow collisions.
  const audioRef = useRef<AudioEngine | null>(null);
  const soundEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!session) return;
    const engine = new AudioEngine(gs.audio);
    audioRef.current = engine;
    if (debug) window.__audio = engine;
    const start = () => void engine.start();
    window.addEventListener("keydown", start);
    window.addEventListener("pointerdown", start);
    window.addEventListener("touchstart", start);
    const offCollision = session.sim.on("collision", (e) => engine.playImpact(e.severity));
    const id = window.setInterval(() => {
      const t = session.sim.getTelemetry(tmpTel);
      engine.update(t.motors, session.sim.status === "flying" && !session.replaying);
      const el = soundEl.current;
      if (el) {
        const txt = engine.state === "running" ? "" : gs.audio.muted ? "" : "Sound off: press any key";
        if (el.textContent !== txt) el.textContent = txt;
      }
    }, 33);
    return () => {
      window.clearInterval(id);
      offCollision();
      window.removeEventListener("keydown", start);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("touchstart", start);
      engine.dispose();
      audioRef.current = null;
    };
    // audio settings are applied live below; the engine itself is created once per session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, debug]);
  useEffect(() => {
    audioRef.current?.setSettings(gs.audio);
  }, [gs.audio, session]);

  // Brief flash on impacts, driven by DOM (no React state per hit).
  const [flashEl, setFlashEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!session || !flashEl || gs.accessibility.reduceFlashes) return;
    return session.sim.on("collision", (e) => {
      const a = e.severity === "minor" ? 0.12 : e.severity === "moderate" ? 0.3 : 0.55;
      flashEl.style.transition = "none";
      flashEl.style.opacity = String(a);
      requestAnimationFrame(() => {
        flashEl.style.transition = "opacity 0.6s ease-out";
        flashEl.style.opacity = "0";
      });
    });
  }, [session, flashEl, gs.accessibility.reduceFlashes]);

  const cameraSettings = useMemo(
    () => ({ vibrationScale: gs.camera.vibration, chaseScale: gs.camera.chaseDistanceScale, fpvFov: gs.camera.fpvFov ?? undefined }),
    [gs.camera],
  );
  const getMarkers = useMemo(
    () => (): MapMarker[] => {
      const m = session?.mission;
      if (!m) return [];
      const active = new Set(m.activeTargets().map((w) => w.id));
      return m.def.waypoints.filter((w) => !m.isReached(w.id)).map((w) => ({ x: w.position[0], z: w.position[2], r: w.radius, active: active.has(w.id) }));
    },
    [session],
  );

  if (error) {
    return <div className="flex h-screen items-center justify-center bg-black p-8 text-red-400">Simulation failed to start: {error}</div>;
  }
  if (!session || !view) {
    return <div className="flex h-screen items-center justify-center bg-neutral-950 font-mono text-sm tracking-widest text-white/60">LOADING SIMULATION</div>;
  }

  const a11y = gs.accessibility;
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <FlightScene session={session} quality={q} camera={cameraSettings} sky={sky} />
      <div ref={setFlashEl} className="pointer-events-none absolute inset-0 opacity-0" style={{ boxShadow: "inset 0 0 160px 40px rgba(255,40,20,0.9)" }} />
      {view.hudVisible && !view.replaying && (
        <div className={`pointer-events-none absolute inset-0 ${a11y.highContrastHud ? "hud-contrast" : ""}`} style={{ zoom: a11y.hudScale }}>
          <Hud session={session} />
        </div>
      )}
      <div className="pointer-events-none absolute left-5 top-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
        {session.sim.drone.name} / {session.sim.env.name} / {view.cameraMode === "fpv" ? "FPV" : "Chase"}
        {weatherLabel !== "calm" ? ` / Wind: ${weatherLabel}` : ""}
      </div>
      <div ref={soundEl} data-testid="sound-hint" className="pointer-events-none absolute left-5 top-9 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/80" />
      {view.hudVisible && a11y.showMinimap && !view.replaying && (
        <div className="pointer-events-none absolute left-5 top-14">
          <Minimap session={session} getMarkers={getMarkers} />
        </div>
      )}
      {session.mission && !view.replaying && <MissionHud session={session} />}
      <MissionOverlay session={session} view={view} />
      <PhonePanel session={session} />
      <Link href={session.mission ? "/missions" : "/"} className="absolute right-5 top-4 text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white">
        Exit
      </Link>
      {!view.launched && view.status === "flying" && !session.mission && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] flex flex-col items-center gap-2 text-center font-mono text-xs uppercase tracking-[0.18em] text-white/80 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
          <div>Arrow Up: throttle. Hold to take off</div>
          <div className="text-white/55">Z/S pitch · Q/D roll · A/E yaw · X cut throttle · C camera · 1/2/3 mode · H hud · V replay · R reset · Space pause</div>
        </div>
      )}
      {view.replaying && <Banner title="Replay" sub="V to exit · C camera · R restart" />}
      {view.status === "paused" && !view.replaying && <Banner title="Paused" sub="Space to resume" />}
      {view.status === "crashed" && !view.replaying && !session.mission && <Banner title="Crashed" sub="R to restart at spawn · V replay" tone="danger" />}
    </div>
  );
}

function Banner({ title, sub, tone }: { title: string; sub: string; tone?: "danger" }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/35">
      <div className={`font-mono text-3xl uppercase tracking-[0.4em] ${tone === "danger" ? "text-red-400" : "text-white"}`}>{title}</div>
      <div className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-white/70">{sub}</div>
    </div>
  );
}
