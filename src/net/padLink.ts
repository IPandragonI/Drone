import { RtcPeer } from "./rtc";
import { parseRelayMessage, type HostTelemetry, type PadActionName, type SignalMsg } from "./protocol";

export type PadLinkState = "connecting" | "online" | "reconnecting" | "denied";

export interface PadSticks {
  r: number;
  p: number;
  y: number;
  th: number;
}

export interface PadLinkSnapshot {
  state: PadLinkState;
  hostPresent: boolean;
  rttMs: number | null;
  telemetry: Omit<HostTelemetry, "t"> | null;
  reason: string | null;
  transport: "websocket" | "webrtc";
}

/** Frame rate sent to the simulator. The host treats >300 ms of silence as a lost link, so a heartbeat is always sent. */
export const PAD_SEND_HZ = 50;

/**
 * Phone side of the link. Sends the current sticks at a fixed rate (even when unchanged, as a heartbeat), measures
 * round-trip time to the relay, and reconnects with backoff if the socket drops. Auth failures are final ("denied").
 */
export class PadLink {
  private snap: PadLinkSnapshot = { state: "connecting", hostPresent: false, rttMs: null, telemetry: null, reason: null, transport: "websocket" };
  private subs = new Set<(s: PadLinkSnapshot) => void>();
  private ws: WebSocket | null = null;
  private rtc: RtcPeer | null = null;
  private seq = 0;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 250;
  private closed = false;
  private readonly sticks: PadSticks = { r: 0, p: 0, y: 0, th: 0 };

  setSticks(patch: Partial<PadSticks>): void {
    Object.assign(this.sticks, patch);
  }

  constructor(
    private readonly relayHostPort: string,
    private readonly session: string,
    private readonly token: string,
  ) {}

  get snapshot(): PadLinkSnapshot {
    return this.snap;
  }

  subscribe(cb: (s: PadLinkSnapshot) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private set(patch: Partial<PadLinkSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.subs.forEach((cb) => cb(this.snap));
  }

  connect(): void {
    if (this.closed) return;
    const scheme = typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
    const q = new URLSearchParams({ role: "pad", s: this.session, t: this.token });
    const ws = new WebSocket(`${scheme}://${this.relayHostPort}/ws?${q.toString()}`);
    this.ws = ws;
    ws.onmessage = (ev) => {
      const m = parseRelayMessage(typeof ev.data === "string" ? ev.data : "");
      if (!m) return;
      switch (m.t) {
        case "sig":
          if (m.k === "offer") this.acceptOffer(m);
          else void this.rtc?.handleSignal(m);
          break;
        case "ready":
          this.closeRtc();
          this.retryDelay = 250;
          this.seq = 0;
          this.set({ state: "online", hostPresent: m.hostPresent === true, reason: null });
          break;
        case "peer":
          if (!m.connected) this.closeRtc();
          this.set({ hostPresent: m.connected });
          break;
        case "pong":
          this.set({ rttMs: Math.max(0, Math.round(performance.now() - m.ts)) });
          break;
        case "tel":
          this.set({ telemetry: { st: m.st, mode: m.mode, hp: m.hp, bat: m.bat } });
          break;
        case "err":
          this.set({ reason: m.reason });
          break;
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopTimers();
      this.closeRtc();
      if (this.closed) return;
      // 4003: bad/expired token, 4004: session ended. Retrying cannot help.
      if (ev.code === 4003 || ev.code === 4004) {
        this.set({ state: "denied", hostPresent: false, reason: this.snap.reason ?? "session not available" });
        return;
      }
      if (ev.code === 4001) return; // replaced by another phone on this session
      this.set({ state: "reconnecting", hostPresent: false });
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 3000);
    };
    ws.onopen = () => {
      this.sendTimer = setInterval(() => this.sendFrame(), 1000 / PAD_SEND_HZ);
      this.pingTimer = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: "ping", ts: performance.now() })), 1000);
    };
  }

  private sendFrame(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 4096) return; // never queue stale sticks
    const s = this.sticks;
    const txt = JSON.stringify({ t: "in", seq: this.seq++, r: round(s.r), p: round(s.p), y: round(s.y), th: round(s.th) });
    if (!this.rtc?.send(txt)) ws.send(txt); // data channel when open, WebSocket otherwise (shared sequence numbers)
  }

  private acceptOffer(offer: SignalMsg): void {
    this.closeRtc();
    if (typeof RTCPeerConnection === "undefined") return;
    try {
      const peer = new RtcPeer("pad", {
        sendSignal: (sig) => this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: "sig", ...sig })),
        onMessage: () => {},
        onOpen: (open) => {
          if (this.rtc === peer) this.set({ transport: open ? "webrtc" : "websocket" });
        },
      });
      this.rtc = peer;
      void peer.handleSignal(offer);
    } catch {
      this.rtc = null;
    }
  }

  private closeRtc(): void {
    this.rtc?.close();
    this.rtc = null;
    if (this.snap.transport !== "websocket") this.set({ transport: "websocket" });
  }

  sendAction(a: PadActionName): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: "act", a }));
  }

  private stopTimers(): void {
    if (this.sendTimer) clearInterval(this.sendTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.sendTimer = this.pingTimer = null;
  }

  close(): void {
    this.closed = true;
    this.stopTimers();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.subs.clear();
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
