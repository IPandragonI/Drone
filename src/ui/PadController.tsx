"use client";

import { useEffect, useRef, useState } from "react";
import { PadLink, type PadLinkSnapshot } from "@/net/padLink";
import type { PadActionName } from "@/net/protocol";

interface StickProps {
  label: string;
  /** Vertical axis holds its position on release (throttle). Horizontal always springs back. */
  latchY?: boolean;
  testId: string;
  onChange: (x: number, y: number) => void;
}

/**
 * Floating stick driven by pointer events: touching anywhere in the zone grabs the stick, movement is relative to the
 * touch-down point (no jump). Each stick owns its pointer, so both thumbs work at once. DOM writes only, no React state.
 */
function Stick({ label, latchY, testId, onChange }: StickProps) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const grab = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number } | null>(null);
  const val = useRef({ x: 0, y: latchY ? -1 : 0 });
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const travel = () => (base.current ? base.current.clientWidth * 0.31 : 40);
  const draw = () => {
    const R = travel();
    if (knob.current) knob.current.style.transform = `translate(${val.current.x * R}px, ${-val.current.y * R}px)`;
  };
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));

  useEffect(() => {
    if (knob.current && base.current) {
      const R = base.current.clientWidth * 0.31;
      knob.current.style.transform = `translate(${val.current.x * R}px, ${-val.current.y * R}px)`;
    }
    onChangeRef.current(val.current.x, val.current.y);
  }, []);

  const move = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || e.pointerId !== g.id) return;
    const R = travel();
    val.current = { x: clamp(g.vx + (e.clientX - g.sx) / R), y: clamp(g.vy - (e.clientY - g.sy) / R) };
    draw();
    onChange(val.current.x, val.current.y);
  };
  const release = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || e.pointerId !== g.id) return;
    grab.current = null;
    val.current = { x: 0, y: latchY ? val.current.y : 0 };
    draw();
    onChange(val.current.x, val.current.y);
  };

  return (
    <div
      data-testid={testId}
      className="relative flex h-full w-[42%] touch-none select-none items-center justify-center"
      onPointerDown={(e) => {
        if (grab.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        grab.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: val.current.x, vy: val.current.y };
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={base} className="relative aspect-square h-[78%] max-h-[260px] rounded-full border border-white/25 bg-white/[0.04]">
        <div className="absolute left-1/2 top-1/2 h-px w-3/5 -translate-x-1/2 bg-white/10" />
        <div className="absolute left-1/2 top-1/2 h-3/5 w-px -translate-y-1/2 bg-white/10" />
        <div ref={knob} className="absolute left-[31%] top-[31%] h-[38%] w-[38%] rounded-full border-2 border-amber-400 bg-amber-400/25 will-change-transform" />
      </div>
      <div className="pointer-events-none absolute bottom-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">{label}</div>
    </div>
  );
}

function ActionButton({ label, action, send, hold, testId }: { label: string; action: PadActionName; send: (a: PadActionName) => void; hold?: number; testId: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [armed, setArmed] = useState(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };
  return (
    <button
      data-testid={testId}
      className={`touch-none select-none rounded border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.15em] active:bg-white/20 ${armed ? "border-red-400 text-red-300" : "border-white/25 text-white/80"}`}
      onPointerDown={() => {
        if (!hold) return send(action);
        setArmed(true);
        timer.current = setTimeout(() => {
          send(action);
          cancel();
        }, hold);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      {hold ? `${label} (hold)` : label}
    </button>
  );
}

export function PadController({ session, token, relay }: { session: string; token: string; relay: string }) {
  const linkRef = useRef<PadLink | null>(null);
  const [snap, setSnap] = useState<PadLinkSnapshot | null>(null);
  const valid = session !== "" && token !== "" && relay !== "";

  useEffect(() => {
    if (!valid) return;
    const l = new PadLink(relay, session, token);
    const unsub = l.subscribe(setSnap);
    linkRef.current = l;
    l.connect();
    let wake: { release(): Promise<void> } | null = null;
    // Keep the screen on while flying (needs a secure context; silently skipped on plain http).
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((w) => (wake = w), () => {});
    return () => {
      unsub();
      l.close();
      wake?.release().catch(() => {});
      linkRef.current = null;
    };
  }, [valid, relay, session, token]);

  const send = (a: PadActionName) => linkRef.current?.sendAction(a);
  const fullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {
      /* not supported (iOS Safari): the page still works */
    }
  };

  if (!valid) {
    return <Message title="Invalid link" sub="Scan the QR code shown in the simulator (Phone button)." />;
  }
  if (snap?.state === "denied") {
    return <Message title="Link expired" sub={`${snap.reason ?? "Session not available"}. Open the Phone panel in the simulator and scan the new QR code.`} />;
  }

  const status =
    !snap || snap.state === "connecting"
      ? "Connecting"
      : snap.state === "reconnecting"
        ? "Reconnecting"
        : snap.hostPresent
          ? "Linked"
          : "Waiting for simulator";
  const linked = snap?.state === "online" && snap.hostPresent;

  return (
    <div data-testid="pad-root" className="fixed inset-0 overflow-hidden bg-[#0b0d0f] text-white">
      <div className="hidden h-full flex-col items-center justify-center gap-2 p-8 text-center portrait:flex">
        <div className="font-mono text-sm uppercase tracking-[0.3em]">Rotate your phone</div>
        <div className="text-xs text-white/60">The controller needs landscape orientation.</div>
      </div>
      <div className="flex h-full flex-col portrait:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-2 font-mono text-[11px] uppercase tracking-[0.18em]">
          <span data-testid="pad-status" className={linked ? "text-emerald-400" : "text-amber-400"}>
            {status}
          </span>
          <span className="text-white/50">
            {snap?.transport === "webrtc" ? "P2P · " : ""}
            {snap?.rttMs != null ? `${snap.rttMs} ms` : "-- ms"}
            {snap?.telemetry ? ` · ${snap.telemetry.mode} · hp ${Math.round(snap.telemetry.hp * 100)}% · bat ${Math.round(snap.telemetry.bat * 100)}%` : ""}
          </span>
          <button className="text-white/60" onClick={fullscreen}>
            Fullscreen
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-stretch justify-between px-2">
          <Stick
            label="Throttle / Yaw"
            latchY
            testId="stick-left"
            onChange={(x, y) => {
              linkRef.current?.setSticks({ y: x, th: (y + 1) / 2 });
            }}
          />
          <div className="flex w-[16%] flex-col items-stretch justify-center gap-2">
            <ActionButton testId="btn-reset" label="Reset" action="reset" send={send} hold={600} />
            <ActionButton testId="btn-pause" label="Pause" action="pause" send={send} />
            <ActionButton testId="btn-camera" label="Cam" action="toggleCamera" send={send} />
            <ActionButton testId="btn-mode" label="Mode" action="modeCycle" send={send} />
          </div>
          <Stick
            label="Pitch / Roll"
            testId="stick-right"
            onChange={(x, y) => {
              linkRef.current?.setSticks({ r: x, p: y });
            }}
          />
        </div>
        {snap?.telemetry?.st === "crashed" && <div className="pointer-events-none absolute inset-x-0 top-10 text-center font-mono text-sm uppercase tracking-[0.3em] text-red-400">Crashed - hold Reset</div>}
        {snap?.telemetry?.st === "paused" && <div className="pointer-events-none absolute inset-x-0 top-10 text-center font-mono text-sm uppercase tracking-[0.3em] text-white/70">Paused</div>}
      </div>
    </div>
  );
}

function Message({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-[#0b0d0f] p-8 text-center text-white">
      <div className="font-mono text-sm uppercase tracking-[0.3em] text-amber-400">{title}</div>
      <div className="max-w-sm text-xs text-white/60">{sub}</div>
    </div>
  );
}
