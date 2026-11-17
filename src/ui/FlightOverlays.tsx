"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { KeyAction, KeyBindings } from "@/config/controls";
import { perfStats } from "@/render/perf";
import type { FlightSession, ViewState } from "@/sim/session";

const NAMES: Record<string, string> = { " ": "Space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", escape: "Esc", enter: "Enter" };
export const keyLabel = (k: string): string => NAMES[k.toLowerCase()] ?? (k.length === 1 ? k.toUpperCase() : k);
const first = (b: KeyBindings, a: KeyAction): string => keyLabel(b[a][0] ?? "?");

/** Controls hint before take-off, built from the player's real bindings and active device. */
export function ControlsHint({ session, view }: { session: FlightSession; view: ViewState }) {
  const [device, setDevice] = useState(session.device);
  useEffect(() => {
    const id = window.setInterval(() => setDevice(session.device), 400);
    return () => window.clearInterval(id);
  }, [session]);
  if (view.launched || view.status !== "flying" || session.mission) return null;
  const b = session.keyboard.getBindings();
  return (
    <div data-testid="controls-hint" className="pointer-events-none absolute inset-x-0 top-[17%] mx-auto flex w-[min(34rem,calc(100vw-2rem))] flex-col items-center gap-2 border border-white/15 bg-black/55 px-5 py-4 text-center backdrop-blur">
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber-300">
        {device === "gamepad" ? "Push the throttle stick up to take off" : device === "phone" ? "Raise the left stick to take off" : `Hold ${first(b, "throttleUp")} to take off`}
      </div>
      <div className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-white/80">
        {first(b, "pitchForward")}/{first(b, "pitchBack")} pitch · {first(b, "rollLeft")}/{first(b, "rollRight")} roll · {first(b, "yawLeft")}/{first(b, "yawRight")} yaw ·{" "}
        {first(b, "throttleUp")}/{first(b, "throttleDown")} throttle
      </div>
      <div className="text-[11px] text-white/60">
        New to flying? Angle mode levels the drone for you. Try <span className="text-amber-300">Training</span> in Missions. Press <span className="font-mono text-white/90">F1</span> for all controls.
      </div>
    </div>
  );
}

/** Full controls reference (F1 or ?). */
export function HelpOverlay({ session, onClose }: { session: FlightSession; onClose: () => void }) {
  const b = session.keyboard.getBindings();
  const rows: Array<[string, KeyAction[]]> = [
    ["Pitch forward / back", ["pitchForward", "pitchBack"]],
    ["Roll left / right", ["rollLeft", "rollRight"]],
    ["Yaw left / right", ["yawLeft", "yawRight"]],
    ["Throttle up / down", ["throttleUp", "throttleDown"]],
    ["Cut throttle", ["throttleCut"]],
    ["Camera", ["toggleCamera"]],
    ["HUD", ["toggleHud"]],
    ["Angle / Horizon / Acro", ["modeAngle", "modeHorizon", "modeAcro"]],
    ["Cycle flight mode", ["modeCycle"]],
    ["Replay", ["replay"]],
    ["Reset to spawn", ["reset"]],
    ["Pause", ["pause"]],
  ];
  return (
    <div data-testid="help-overlay" className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-full w-[min(44rem,100%)] overflow-auto border border-white/25 bg-[#0d1013] p-6 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold uppercase tracking-tight">Controls</h2>
          <button onClick={onClose} className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60 hover:text-white">
            Close (F1)
          </button>
        </div>
        <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Keyboard</div>
            {rows.map(([name, actions]) => (
              <div key={name} className="flex justify-between gap-4 border-b border-white/10 py-1.5 text-sm">
                <span className="text-white/70">{name}</span>
                <span className="font-mono">{actions.map((a) => first(b, a)).join(" / ")}</span>
              </div>
            ))}
            <p className="mt-2 text-xs text-white/45">Change keys in Settings → Controls.</p>
          </div>
          <div className="mt-6 space-y-4 text-sm text-white/70 sm:mt-0">
            <div>
              <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Gamepad</div>
              Sticks per your Mode 1/2 setting. Y resets, Start pauses, X switches camera, RB cycles flight mode.
            </div>
            <div>
              <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Phone</div>
              Use the Phone button (top right) and scan the QR code. Left stick: throttle and yaw. Right stick: pitch and roll.
            </div>
            <div>
              <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300">Flight modes</div>
              <b className="text-white">Angle</b>: self-levelling, best to learn. <b className="text-white">Horizon</b>: levels when sticks are centred, flips allowed.{" "}
              <b className="text-white">Acro</b>: no self-levelling, pure rate control.
            </div>
            <div className="text-xs text-white/45">F3 shows performance statistics.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Area warning, crash banner (reason, restart button, optional auto-restart) and the pause menu. */
export function StatusOverlays({ session, view, autoRestartSec }: { session: FlightSession; view: ViewState; autoRestartSec: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const crashed = view.status === "crashed" && !view.replaying;
  const hasMission = !!session.mission;

  useEffect(() => {
    if (!crashed || autoRestartSec <= 0) return;
    let n = autoRestartSec;
    const t0 = window.setTimeout(() => setLeft(n), 0);
    const id = window.setInterval(() => {
      n--;
      if (n <= 0) {
        window.clearInterval(id);
        session.restart();
        setLeft(null);
      } else setLeft(n);
    }, 1000);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(id);
      setLeft(null);
    };
  }, [crashed, autoRestartSec, session]);

  return (
    <>
      {view.bounds === "warn" && !view.replaying && (
        <div data-testid="bounds-warning" className="pointer-events-none absolute inset-x-0 top-[26%] text-center font-mono text-sm uppercase tracking-[0.25em] text-amber-300 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
          Approaching the edge of the flight area
        </div>
      )}
      {view.bounds === "out" && !view.replaying && (
        <div data-testid="bounds-out" className="pointer-events-none absolute inset-x-0 top-[24%] text-center [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
          <div className="font-mono text-lg uppercase tracking-[0.3em] text-red-400">Outside the flight area</div>
          <div className="mt-1 font-mono text-sm uppercase tracking-[0.2em] text-white/85">Return now: {view.boundsSecondsLeft}s</div>
        </div>
      )}

      {crashed && !hasMission && (
        <div data-testid="crash-banner" className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
          <div className="font-mono text-3xl uppercase tracking-[0.4em] text-red-400">Crashed</div>
          <div data-testid="crash-reason" className="mt-3 font-mono text-sm uppercase tracking-[0.2em] text-white/85">
            {view.crashReason ?? "Unknown"}
          </div>
          <div className="mt-6 flex gap-3">
            <button data-testid="crash-restart" onClick={() => session.restart()} className="bg-white px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-black hover:bg-amber-400">
              Restart (R)
            </button>
          </div>
          <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">V: watch the replay{left !== null ? ` · restarting in ${left}s` : ""}</div>
        </div>
      )}

      {view.status === "paused" && !view.replaying && (
        <div data-testid="pause-menu" className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="w-[min(20rem,90vw)] border border-white/25 bg-[#0d1013] p-6 text-white">
            <div className="font-mono text-xs uppercase tracking-[0.35em] text-amber-300">Paused</div>
            <div className="mt-4 flex flex-col gap-2">
              <button data-testid="pause-resume" onClick={() => session.togglePauseUi()} className="bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-black hover:bg-amber-400">
                Resume
              </button>
              <button
                data-testid="pause-restart"
                onClick={() => {
                  session.restart();
                  session.togglePauseUi();
                }}
                className="border border-white/30 px-4 py-3 text-xs uppercase tracking-[0.2em] hover:border-white"
              >
                Restart
              </button>
              <Link href="/settings" className="border border-white/30 px-4 py-3 text-center text-xs uppercase tracking-[0.2em] hover:border-white">
                Settings
              </Link>
              <Link href={hasMission ? "/missions" : "/launch"} className="border border-white/30 px-4 py-3 text-center text-xs uppercase tracking-[0.2em] hover:border-white">
                Exit
              </Link>
            </div>
            <p className="mt-4 text-center text-[11px] text-white/45">Space or Esc to resume</p>
          </div>
        </div>
      )}
    </>
  );
}

/** F3 performance panel plus an automatic "running slowly" hint. Reads the counters directly (no React state per frame). */
export function PerfOverlay({ quality, panel }: { quality: string; panel: boolean }) {
  const el = useRef<HTMLPreElement>(null);
  const slow = useRef(0);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = perfStats;
      if (el.current) {
        el.current.textContent = `fps       ${p.fps.toFixed(0)}\nframe     ${p.frameMs.toFixed(1)} ms\ndraw      ${p.drawCalls}\ntriangles ${(p.triangles / 1000).toFixed(0)}k\ngeometry  ${p.geometries}\ntextures  ${p.textures}\nquality   ${quality}`;
      }
      slow.current = p.fps > 0 && p.fps < 24 && quality !== "low" ? slow.current + 1 : 0;
      setHint(slow.current >= 10);
    }, 1000);
    return () => window.clearInterval(id);
  }, [quality]);
  return (
    <>
      {panel && <pre ref={el} data-testid="perf-overlay" className="pointer-events-none absolute bottom-28 left-5 border border-white/20 bg-black/60 p-3 font-mono text-[11px] leading-5 text-emerald-300" />}
      {hint && (
        <div data-testid="slow-hint" className="pointer-events-none absolute inset-x-0 top-20 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-amber-300 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
          Running slowly: try Low graphics in Settings
        </div>
      )}
    </>
  );
}
