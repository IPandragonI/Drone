"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { HostLink, type HostLinkSnapshot } from "@/net/hostLink";
import type { FlightSession } from "@/sim/session";

const STATE_LABEL: Record<HostLinkSnapshot["state"], string> = {
  idle: "Idle",
  creating: "Creating session",
  waiting: "Waiting for phone",
  paired: "Phone connected",
  error: "Error",
};

/**
 * Pairing panel: creates a session at the local relay, shows a QR code and the link state.
 * The HostLink lives as long as the flight session; closing the panel does not drop a connected phone.
 */
export function PhonePanel({ session }: { session: FlightSession }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<HostLinkSnapshot | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const linkRef = useRef<HostLink | null>(null);

  useEffect(() => {
    return () => {
      linkRef.current?.dispose();
      linkRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!snap?.padUrl) return;
    let cancelled = false;
    QRCode.toDataURL(snap.padUrl, { margin: 1, width: 240, color: { dark: "#0b0d0f", light: "#ffffff" } }).then(
      (url) => !cancelled && setQr(url),
      () => !cancelled && setQr(null),
    );
    return () => {
      cancelled = true;
    };
  }, [snap?.padUrl]);

  const ensureLink = (): HostLink => {
    if (!linkRef.current) {
      const l = new HostLink(session.remote, () => {
        const t = session.sim.getTelemetry();
        return { st: session.sim.status, mode: session.sim.mode, hp: t.health, bat: t.battery };
      });
      l.subscribe(setSnap);
      linkRef.current = l;
      void l.start();
    }
    return linkRef.current;
  };

  const toggle = () => {
    if (!open) ensureLink();
    setOpen(!open);
  };

  const paired = snap?.state === "paired";

  return (
    <div className="absolute right-5 top-10 flex flex-col items-end gap-2 text-[11px] uppercase tracking-[0.2em]">
      <button data-testid="phone-toggle" onClick={toggle} className={paired ? "text-emerald-400" : "text-white/60 hover:text-white"}>
        Phone{paired ? " ●" : ""}
      </button>
      {open && (
        <div data-testid="phone-panel" className="w-64 border border-white/20 bg-black/80 p-3 normal-case tracking-normal text-white/80 backdrop-blur">
          <div data-testid="phone-state" className={`font-mono text-[11px] uppercase tracking-[0.15em] ${snap?.state === "error" ? "text-red-400" : paired ? "text-emerald-400" : "text-amber-400"}`}>
            {snap ? STATE_LABEL[snap.state] : "Starting"}
          </div>
          {paired && (
            <div data-testid="phone-transport" className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white/50">
              {snap?.transport === "webrtc" ? "Link: WebRTC (peer-to-peer)" : "Link: WebSocket via relay"}
            </div>
          )}
          {snap?.error && <p className="mt-2 text-xs text-red-300">{snap.error}</p>}
          {snap?.padUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img data-testid="phone-qr" src={qr} alt="QR code to open the phone controller" className="mx-auto mt-3 h-48 w-48" />}
              <p className="mt-2 text-xs">
                Scan with your phone (same Wi-Fi). Code <span className="font-mono">{snap.session}</span>
              </p>
              <p data-testid="phone-url" className="mt-1 break-all font-mono text-[10px] text-white/45">
                {snap.padUrl}
              </p>
            </>
          )}
          <div className="mt-3 flex gap-3 font-mono text-[11px] uppercase tracking-[0.15em]">
            <button onClick={() => void ensureLink().start()} className="text-white/70 hover:text-white">
              New code
            </button>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
