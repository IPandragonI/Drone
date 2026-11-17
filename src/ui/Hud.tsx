"use client";

import { useEffect, useRef } from "react";
import type { FlightSession } from "@/sim/session";
import type { Telemetry } from "@/sim/types";

const tel: Telemetry = {
  speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0,
  motors: [0, 0, 0, 0], position: [0, 0, 0],
};

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/**
 * Telemetry readout. Values are written straight into the DOM at 15 Hz;
 * React never re-renders for telemetry.
 */
export function Hud({ session }: { session: FlightSession }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const r: Record<string, HTMLElement | null> = {};
    for (const k of ["speed", "vs", "alt", "hdg", "time", "mode", "bat", "hp", "batbar"]) {
      r[k] = container.querySelector<HTMLElement>(`[data-k="${k}"]`);
    }
    const id = window.setInterval(() => {
      const t = session.sim.getTelemetry(tel);
      const put = (k: string, v: string) => {
        const el = r[k];
        if (el && el.textContent !== v) el.textContent = v;
      };
      put("speed", (t.speedH * 3.6).toFixed(0));
      put("vs", `${t.speedV >= 0 ? "+" : ""}${t.speedV.toFixed(1)}`);
      put("alt", t.altitude.toFixed(1));
      put("hdg", `${String(Math.round(t.heading) % 360).padStart(3, "0")} ${CARDINALS[Math.round(t.heading / 45) % 8]}`);
      put("time", fmtTime(t.flightTime));
      put("mode", session.sim.mode.toUpperCase());
      put("bat", `${Math.round(t.battery * 100)}%`);
      put("hp", `${Math.round(t.health * 100)}%`);
      const bar = r.batbar;
      if (bar) {
        bar.style.width = `${t.battery * 100}%`;
        bar.style.background = t.battery < 0.15 ? "#ff4d3d" : t.battery < 0.3 ? "#ffb020" : "#e6edf3";
      }
    }, 66);
    return () => window.clearInterval(id);
  }, [session]);

  const cell = "flex flex-col items-start";
  const label = "text-[11px] uppercase tracking-[0.16em] text-white/80";
  const value = "font-mono text-2xl tabular-nums text-white";

  return (
    <div ref={root} className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
      <div className="flex gap-6">
        <div className={cell}>
          <span className={label}>Speed km/h</span>
          <span data-k="speed" className={value}>0</span>
        </div>
        <div className={cell}>
          <span className={label}>V/S m/s</span>
          <span data-k="vs" className={value}>0.0</span>
        </div>
        <div className={cell}>
          <span className={label}>Alt m</span>
          <span data-k="alt" className={value}>0.0</span>
        </div>
      </div>
      <div className="flex gap-6">
        <div className={cell}>
          <span className={label}>Heading</span>
          <span data-k="hdg" className={value}>000 N</span>
        </div>
        <div className={cell}>
          <span className={label}>Time</span>
          <span data-k="time" className={value}>00:00</span>
        </div>
        <div className={cell}>
          <span className={label}>Mode</span>
          <span data-k="mode" className={value}>-</span>
        </div>
        <div className={cell}>
          <span className={label}>Frame</span>
          <span data-k="hp" className={value}>100%</span>
        </div>
        <div className={cell}>
          <span className={label}>Battery</span>
          <span data-k="bat" className={value}>100%</span>
          <div className="mt-1 h-[3px] w-20 bg-white/25">
            <div data-k="batbar" className="h-full w-full bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}
