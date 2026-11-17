"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MISSION_BY_ID } from "@/missions/defs";
import { emptyProgress, type Progress } from "@/missions/progress";
import { clearProgress, loadProgress } from "@/storage/progress";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function StatsView() {
  const [p, setP] = useState<Progress>(emptyProgress());
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    loadProgress().then(setP);
  }, []);

  const s = p.stats;
  const cell = "border border-white/15 p-4";
  const num = "font-mono text-2xl tabular-nums";
  const label = "text-[10px] uppercase tracking-[0.2em] text-white/50";
  return (
    <main className="min-h-screen bg-[#101214] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-baseline justify-between border-b border-white/15 pb-3">
          <h1 className="text-2xl font-semibold uppercase tracking-tight">Stats and history</h1>
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-white/60 hover:text-white">
            Back
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className={cell}>
            <div className={num} data-testid="stat-flights">{s.flights}</div>
            <div className={label}>Flights</div>
          </div>
          <div className={cell}>
            <div className={num} data-testid="stat-time">{fmt(s.flightTime)}</div>
            <div className={label}>Airborne time</div>
          </div>
          <div className={cell}>
            <div className={num} data-testid="stat-crashes">{s.crashes}</div>
            <div className={label}>Crashes</div>
          </div>
          <div className={cell}>
            <div className={num}>{s.collisions}</div>
            <div className={label}>Impacts</div>
          </div>
          <div className={cell}>
            <div className={num}>{s.missionsAttempted}</div>
            <div className={label}>Missions attempted</div>
          </div>
          <div className={cell}>
            <div className={num} data-testid="stat-completed">{s.missionsCompleted}</div>
            <div className={label}>Missions completed</div>
          </div>
        </div>

        <h2 className="mb-3 mt-10 font-mono text-xs uppercase tracking-[0.25em] text-white/60">Recent missions</h2>
        {p.history.length === 0 ? (
          <p className="text-sm text-white/50">No missions flown yet.</p>
        ) : (
          <table data-testid="history" className="w-full text-left font-mono text-sm">
            <thead className="text-[10px] uppercase tracking-[0.15em] text-white/45">
              <tr>
                <th className="py-2">Mission</th>
                <th>Result</th>
                <th>Score</th>
                <th>Time</th>
                <th>Hits</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {p.history.map((r, i) => (
                <tr key={`${r.at}-${i}`} className="border-t border-white/10">
                  <td className="py-2">{MISSION_BY_ID[r.missionId]?.name ?? r.missionId}</td>
                  <td className={r.completed ? "text-emerald-400" : "text-red-400"}>{r.completed ? (r.medal !== "none" ? r.medal : "done") : r.failReason === "time" ? "time out" : "crash"}</td>
                  <td>{r.score}</td>
                  <td>{fmt(r.time)}</td>
                  <td>{r.collisions}</td>
                  <td className="text-white/50">{r.at ? new Date(r.at).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-10 border-t border-white/15 pt-4">
          {!confirm ? (
            <button data-testid="clear-progress" onClick={() => setConfirm(true)} className="text-xs uppercase tracking-[0.2em] text-white/50 hover:text-red-400">
              Clear all progress
            </button>
          ) : (
            <div className="flex items-center gap-4 text-xs uppercase tracking-[0.2em]">
              <span className="text-red-400">Delete all scores and stats?</span>
              <button
                data-testid="clear-confirm"
                onClick={() => {
                  void clearProgress().then(setP);
                  setConfirm(false);
                }}
                className="text-red-400 underline"
              >
                Yes, delete
              </button>
              <button onClick={() => setConfirm(false)} className="text-white/60">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
