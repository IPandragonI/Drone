import type { RemoteInput } from "@/sim/input/remote";
import { RtcPeer } from "./rtc";
import { RELAY_DEFAULT_PORT, buildPadUrl, parsePadMessage, parseRelayMessage, type HostTelemetry, type PairingInfo } from "./protocol";

/**
 * Where the relay lives. NEXT_PUBLIC_RELAY_URL (e.g. https://relay.example.com) points the app at a hosted relay.
 * Without it the relay is assumed to run on the same machine (`npm run relay`, port 3101), which cannot work from an
 * https page (browsers block ws:// from secure pages), so the phone feature reports itself unavailable there.
 */
export function relayConfig(): { http: string | null; hostPort: string | null; problem: string | null } {
  const env = process.env.NEXT_PUBLIC_RELAY_URL;
  if (env) {
    try {
      const u = new URL(env);
      return { http: u.origin, hostPort: u.host, problem: null };
    } catch {
      return { http: null, hostPort: null, problem: "NEXT_PUBLIC_RELAY_URL is not a valid URL." };
    }
  }
  if (typeof location === "undefined") return { http: null, hostPort: null, problem: null };
  if (location.protocol === "https:") {
    return { http: null, hostPort: null, problem: "The phone controller needs a relay server, and none is configured for this deployment. It works when you run the simulator on your own computer (see README), or when the site is built with NEXT_PUBLIC_RELAY_URL." };
  }
  return { http: `http://${location.hostname}:${RELAY_DEFAULT_PORT}`, hostPort: null, problem: null };
}

export type HostLinkState = "idle" | "creating" | "waiting" | "paired" | "error";

export interface HostLinkSnapshot {
  state: HostLinkState;
  /** URL to put in the QR code (null until a session exists). */
  padUrl: string | null;
  session: string | null;
  error: string | null;
  /** Path the latest stick frame arrived on. */
  transport: "websocket" | "webrtc";
}

/**
 * Simulator side of the phone link (browser). Creates a session at the local relay, connects as host, feeds validated
 * pad messages into `RemoteInput` and pushes telemetry back to the phone. Reconnects automatically while the session lives.
 */
export class HostLink {
  private snap: HostLinkSnapshot = { state: "idle", padUrl: null, session: null, error: null, transport: "websocket" };
  private subs = new Set<(s: HostLinkSnapshot) => void>();
  private ws: WebSocket | null = null;
  private rtc: RtcPeer | null = null;
  private pairing: PairingInfo | null = null;
  private telTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private retryDelay = 250;

  constructor(
    private readonly remote: RemoteInput,
    private readonly getTelemetry: () => Omit<HostTelemetry, "t">,
    private readonly relayHttp: string = relayConfig().http ?? "",
  ) {}

  get snapshot(): HostLinkSnapshot {
    return this.snap;
  }

  subscribe(cb: (s: HostLinkSnapshot) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private set(patch: Partial<HostLinkSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.subs.forEach((cb) => cb(this.snap));
  }

  /** Create a fresh session (new QR) and connect. Any previous session is abandoned. */
  async start(): Promise<void> {
    this.teardownSocket();
    this.remote.setConnected(false);
    this.set({ state: "creating", error: null, padUrl: null, session: null });
    const cfg = relayConfig();
    if (cfg.problem || !this.relayHttp) {
      this.set({ state: "error", error: cfg.problem ?? "No relay configured." });
      return;
    }
    try {
      const res = await fetch(`${this.relayHttp}/session`, { method: "POST" });
      if (!res.ok) throw new Error(`relay answered ${res.status}`);
      const info = (await res.json()) as PairingInfo;
      if (this.disposed) return;
      this.pairing = info;
      const hosted = cfg.hostPort !== null;
      const appHost = hosted ? location.hostname : this.pickAppHost(info.lan);
      const origin = hosted ? location.origin : `${location.protocol}//${appHost}${location.port ? `:${location.port}` : ""}`;
      this.set({ state: "waiting", session: info.session, padUrl: buildPadUrl(origin, cfg.hostPort ?? `${appHost}:${info.port}`, info.session, info.padToken) });
      this.retryDelay = 250;
      this.connect();
    } catch (e) {
      this.set({ state: "error", error: `Relay not reachable (${e instanceof Error ? e.message : String(e)}). Start it with: npm run relay` });
    }
  }

  /** The page may already be opened via a LAN address; otherwise substitute the machine's best LAN IP for localhost. */
  private pickAppHost(lan: string[]): string {
    const h = location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]") return h;
    return lan[0] ?? h;
  }

  private connect(): void {
    const p = this.pairing;
    if (!p || this.disposed) return;
    const base = this.relayHttp.replace(/^http/, "ws");
    const ws = new WebSocket(`${base}/ws?role=host&s=${p.session}&t=${p.hostToken}`);
    this.ws = ws;
    ws.onmessage = (ev) => this.handleRaw(typeof ev.data === "string" ? ev.data : "", "websocket");
    ws.onopen = () => {
      this.retryDelay = 250;
      this.telTimer ??= setInterval(() => this.sendTelemetry(), 250);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.closeRtc();
      this.remote.setConnected(false);
      if (this.telTimer) clearInterval(this.telTimer);
      this.telTimer = null;
      if (this.pairing && !this.disposed) {
        this.set({ state: "waiting" });
        this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 3000);
      }
    };
  }

  private handleRaw(raw: string, via: "websocket" | "webrtc"): void {
    const pad = parsePadMessage(raw);
    if (pad) {
      this.remote.apply(pad);
      if (pad.t === "in" && this.snap.transport !== via) this.set({ transport: via });
      return;
    }
    const m = parseRelayMessage(raw);
    if (!m) return;
    if (m.t === "peer") {
      this.remote.setConnected(m.connected);
      this.set({ state: m.connected ? "paired" : "waiting" });
      if (m.connected) this.startRtc();
      else this.closeRtc();
    } else if (m.t === "sig") {
      void this.rtc?.handleSignal(m);
    } else if (m.t === "err") {
      this.set({ state: "error", error: `Relay: ${m.reason}. Generate a new code.` });
      this.pairing = null;
    }
  }

  /** Try to upgrade to a WebRTC data channel; any failure leaves the WebSocket path in use. */
  private startRtc(): void {
    this.closeRtc();
    if (typeof RTCPeerConnection === "undefined") return;
    try {
      const peer = new RtcPeer("host", {
        sendSignal: (sig) => this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: "sig", ...sig })),
        onMessage: (text) => this.handleRaw(text, "webrtc"),
        onOpen: (open) => {
          if (!open && this.rtc === peer && this.snap.transport === "webrtc") this.set({ transport: "websocket" });
        },
      });
      this.rtc = peer;
      void peer.start();
    } catch {
      this.rtc = null;
    }
  }

  private closeRtc(): void {
    this.rtc?.close();
    this.rtc = null;
    if (this.snap.transport !== "websocket") this.set({ transport: "websocket" });
  }

  private sendTelemetry(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: "tel", ...this.getTelemetry() }));
  }

  private teardownSocket(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.telTimer) clearInterval(this.telTimer);
    this.retryTimer = this.telTimer = null;
    this.closeRtc();
    const ws = this.ws;
    this.ws = null;
    this.pairing = null;
    ws?.close();
  }

  dispose(): void {
    this.disposed = true;
    this.teardownSocket();
    this.remote.setConnected(false);
    this.subs.clear();
  }
}
