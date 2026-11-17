"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { MissionResult } from "@/missions/types";
import type { FlightSession, ViewState } from "@/sim/session";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const MEDAL_COLOR: Record<string, string> = { gold: "text-amber-300", silver: "text-slate-200", bronze: "text-orange-400", none: "text-white/50" };

/** Objective line, timer and hit counter, written straight to the DOM at 10 Hz (no per-frame React state). */
export function MissionHud({ session }: { session: FlightSession }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const m = session.mission;
    if (!el || !m) return;
    const q = (k: string) => el.querySelector<HTMLElement>(`[data-k="${k}"]`);
    const id = window.setInterval(() => {
      const next = m.activeTargets();
      const set = (k: string, v: string) => {
        const e = q(k);
        if (e && e.textContent !== v) e.textContent = v;
      };
      set("target", m.status === "completed" ? "Complete" : next.length === 1 ? next[0].label : `${next.length} remaining`);
      set("count", `${m.reachedCount}/${m.def.waypoints.length}`);
      set("time", `${fmt(m.time)} / ${fmt(m.def.timeLimit)}`);
      set("hits", String(m.collisions));
      const ring = q("dwell");
      if (ring) ring.style.width = `${Math.round(m.dwellProgress * 100)}%`;
    }, 100);
    return () => window.clearInterval(id);
  }, [session]);

  const m = session.mission;
  if (!m) return null;
  const label = "text-[10px] uppercase tracking-[0.18em] text-white/55";
  return (
    <div ref={root} data-testid="mission-hud" className="pointer-events-none absolute inset-x-0 top-12 flex flex-col items-center gap-1 font-mono text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">{m.def.name}</div>
      <div className="flex items-baseline gap-5 text-sm">
        <span>
          <span className={label}>Target </span>
          <span data-k="target">-</span>
        </span>
        <span>
          <span className={label}>Done </span>
          <span data-k="count">0</span>
        </span>
        <span>
          <span className={label}>Time </span>
          <span data-k="time">00:00</span>
        </span>
        <span>
          <span className={label}>Hits </span>
          <span data-k="hits">0</span>
        </span>
      </div>
      <div className="h-1 w-40 bg-white/15">
        <div data-k="dwell" className="h-full w-0 bg-amber-300" />
      </div>
    </div>
  );
}

/** Briefing before launch and result card after the mission ends. */
export function MissionOverlay({ session, view }: { session: FlightSession; view: ViewState }) {
  const m = session.mission;
  if (!m) return null;

  if (!view.launched && view.missionStatus === "ready") {
    return (
      <div data-testid="mission-briefing" className="pointer-events-none absolute inset-x-0 top-[22%] mx-auto w-[min(32rem,90vw)] border border-white/20 bg-black/65 p-5 text-white backdrop-blur">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-300">{m.def.kind} mission</div>
        <h2 className="mt-1 text-xl font-semibold uppercase tracking-tight">{m.def.name}</h2>
        <p className="mt-2 text-sm text-white/75">{m.def.briefing}</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.15em] text-white/55">
          {m.def.waypoints.length} targets · {m.def.ordered ? "in order" : "any order"} · par {fmt(m.def.parTime)} · limit {fmt(m.def.timeLimit)}
        </p>
        <p className="mt-3 text-xs text-white/60">Take off to start the clock.</p>
      </div>
    );
  }

  if (view.missionStatus === "completed" || view.missionStatus === "failed") {
    const r = m.result();
    if (!r) return null;
    return <ResultCard result={r} name={m.def.name} />;
  }
  return null;
}

function ResultCard({ result: r, name }: { result: MissionResult; name: string }) {
  const row = "flex justify-between gap-8 font-mono text-sm";
  return (
    <div data-testid="mission-result" className="absolute inset-0 flex items-center justify-center bg-black/55">
      <div className="w-[min(26rem,90vw)] border border-white/25 bg-[#0d1013]/95 p-6 text-white">
        <div className={`font-mono text-xs uppercase tracking-[0.3em] ${r.completed ? "text-emerald-400" : "text-red-400"}`}>
          {r.completed ? "Mission complete" : r.failReason === "time" ? "Out of time" : "Crashed"}
        </div>
        <h2 className="mt-1 text-2xl font-semibold uppercase tracking-tight">{name}</h2>
        <div className={`mt-2 font-mono text-lg uppercase tracking-[0.2em] ${MEDAL_COLOR[r.medal]}`} data-testid="mission-medal">
          {r.medal === "none" ? "No medal" : `${r.medal} medal`}
        </div>
        <div className="mt-4 space-y-1">
          <div className={row}>
            <span className="text-white/55">Targets</span>
            <span>
              {r.reached}/{r.total} (+{r.breakdown.waypoints})
            </span>
          </div>
          <div className={row}>
            <span className="text-white/55">Time {fmt(r.time)}</span>
            <span>+{r.breakdown.time}</span>
          </div>
          <div className={row}>
            <span className="text-white/55">Health {Math.round(r.health * 100)}%</span>
            <span>+{r.breakdown.health}</span>
          </div>
          <div className={row}>
            <span className="text-white/55">Impacts {r.collisions}</span>
            <span>-{r.breakdown.penalties}</span>
          </div>
          <div className={`${row} mt-2 border-t border-white/15 pt-2 text-base`}>
            <span>Score</span>
            <span data-testid="mission-score">
              {r.score} / {r.maxScore}
            </span>
          </div>
        </div>
        <div className="mt-5 flex gap-5 font-mono text-[11px] uppercase tracking-[0.15em]">
          <span className="text-white/70">R retry</span>
          <span className="text-white/70">V replay</span>
          <Link href="/missions" className="pointer-events-auto text-amber-300 hover:text-amber-200">
            Missions
          </Link>
        </div>
      </div>
    </div>
  );
}
