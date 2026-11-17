"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DRONES } from "@/config/drones";
import { ENV_BY_ID } from "@/env/registry";
import { MISSIONS } from "@/missions/defs";
import { DIFFICULTIES, bestKey, emptyProgress, isUnlocked, type Progress } from "@/missions/progress";
import type { Difficulty } from "@/missions/types";
import { loadGameSettings } from "@/storage/gameSettings";
import { maxScore, scaleMission } from "@/missions/runner";
import { loadProgress } from "@/storage/progress";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const MEDAL_COLOR: Record<string, string> = { gold: "text-amber-300", silver: "text-slate-200", bronze: "text-orange-400", none: "text-white/40" };

export function MissionsMenu() {
  const [progress, setProgress] = useState<Progress>(emptyProgress());
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [unlockAll, setUnlockAll] = useState(false);

  useEffect(() => {
    loadProgress().then(setProgress);
    loadGameSettings().then((g) => setUnlockAll(g.gameplay.unlockAll));
  }, []);

  return (
    <main className="min-h-screen bg-[#101214] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-baseline justify-between border-b border-white/15 pb-3">
          <h1 className="text-2xl font-semibold uppercase tracking-tight">Missions</h1>
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-white/60 hover:text-white">
            Back
          </Link>
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Difficulty</span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              data-testid={`difficulty-${d}`}
              onClick={() => setDifficulty(d)}
              className={`border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] ${difficulty === d ? "border-amber-400 bg-amber-400 text-black" : "border-white/25 text-white/70 hover:border-white/50"}`}
            >
              {d}
            </button>
          ))}
          <span className="text-xs text-white/45">{difficulty === "easy" ? "50% more time, forgiving impacts" : difficulty === "hard" ? "20% less time, harsh impacts" : "Standard time and impacts"}</span>
        </div>
        <div className="grid gap-4">
          {MISSIONS.map((m) => {
            const best = progress.best[bestKey(m.id, difficulty)];
            const unlocked = isUnlocked(m, progress, unlockAll);
            const needs = (m.requires ?? []).filter((id) => !DIFFICULTIES.some((d) => progress.best[bestKey(id, d)])).map((id) => MISSIONS.find((x) => x.id === id)?.name ?? id);
            return (
              <div key={m.id} data-testid={`mission-${m.id}`} className={`border p-5 ${unlocked ? "border-white/20" : "border-white/10 opacity-60"}`}>
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-300">{m.kind}</div>
                    <h2 className="mt-1 text-xl font-semibold uppercase tracking-tight">{m.name}</h2>
                  </div>
                  <div data-testid={`best-${m.id}`} className={`text-right font-mono text-sm uppercase tracking-[0.15em] ${MEDAL_COLOR[best?.medal ?? "none"]}`}>
                    {best ? (
                      <>
                        {best.medal !== "none" ? best.medal : "done"}
                        <div className="text-white/60">
                          {best.score}/{maxScore(m)} · {fmt(best.time)}
                        </div>
                      </>
                    ) : (
                      "not flown"
                    )}
                  </div>
                </div>
                <p className="mt-2 max-w-2xl text-sm text-white/70">{m.briefing}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/50">
                    {ENV_BY_ID[m.envId]?.name} · {DRONES[m.droneId]?.name} · {m.mode} · {m.waypoints.length} targets · par {fmt(scaleMission(m, difficulty).parTime)} · limit {fmt(scaleMission(m, difficulty).timeLimit)}
                    {m.weather && m.weather !== "calm" ? ` · wind ${m.weather}` : ""}
                  </div>
                  {unlocked ? (
                    <Link data-testid={`fly-${m.id}`} href={`/fly?mission=${m.id}&difficulty=${difficulty}`} className="bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black hover:bg-amber-400">
                      {m.kind === "training" ? "Start" : "Fly"}
                    </Link>
                  ) : (
                    <span data-testid={`locked-${m.id}`} className="border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/50">
                      Locked: finish {needs.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
