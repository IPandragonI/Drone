/**
 * Wire protocol between the phone controller ("pad"), the local relay and the simulator ("host").
 * Messages are small JSON text frames. The relay only forwards them; the host validates strictly
 * with the functions below, so a hostile or buggy client can never inject NaN/out-of-range values.
 */

export const PROTOCOL_VERSION = 1;
export const RELAY_DEFAULT_PORT = 3101;

/** Actions a phone can trigger (edge events, not continuous). */
export const PAD_ACTIONS = ["reset", "pause", "toggleCamera", "toggleHud", "modeCycle"] as const;
export type PadActionName = (typeof PAD_ACTIONS)[number];

/** Continuous stick frame. r/p/y in [-1,1] (+roll right, +pitch forward, +yaw right), th in [0,1] absolute. */
export interface PadFrame {
  t: "in";
  seq: number;
  r: number;
  p: number;
  y: number;
  th: number;
}

export interface PadActionMsg {
  t: "act";
  a: PadActionName;
}

export type PadToHost = PadFrame | PadActionMsg;

/** Host -> pad status, shown on the phone. */
export interface HostTelemetry {
  t: "tel";
  st: "flying" | "crashed" | "paused";
  mode: string;
  hp: number;
  bat: number;
}

/** WebRTC signaling relayed between host and pad: SDP offer/answer and ICE candidates. */
export interface SignalMsg {
  t: "sig";
  k: "offer" | "answer" | "ice";
  d: Record<string, unknown>;
}

export const MAX_SIGNAL_BYTES = 12_000;

export type RelayToClient =
  | { t: "ready"; role: "host" | "pad"; hostPresent?: boolean }
  | { t: "peer"; connected: boolean }
  | { t: "pong"; ts: number }
  | { t: "err"; reason: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest accepted raw message, bytes. */
export const MAX_MESSAGE_BYTES = 512;

/** Parse and validate a pad->host JSON string. Returns null for anything malformed. */
export function parsePadMessage(raw: string): PadToHost | null {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.t === "act") {
    return typeof o.a === "string" && (PAD_ACTIONS as readonly string[]).includes(o.a) ? { t: "act", a: o.a as PadActionName } : null;
  }
  if (o.t === "in") {
    const { seq, r, p, y, th } = o;
    if (![seq, r, p, y, th].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    if (!Number.isInteger(seq) || (seq as number) < 0) return null;
    return {
      t: "in",
      seq: seq as number,
      r: clamp(r as number, -1, 1),
      p: clamp(p as number, -1, 1),
      y: clamp(y as number, -1, 1),
      th: clamp(th as number, 0, 1),
    };
  }
  return null;
}

/** Parse a relay->client message (loose: unknown types are ignored by callers). */
export function parseRelayMessage(raw: string): RelayToClient | HostTelemetry | SignalMsg | null {
  if (typeof raw !== "string" || raw.length > MAX_SIGNAL_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.t) {
    case "sig":
      return (o.k === "offer" || o.k === "answer" || o.k === "ice") && typeof o.d === "object" && o.d !== null && !Array.isArray(o.d)
        ? { t: "sig", k: o.k, d: o.d as Record<string, unknown> }
        : null;
    case "ready":
      return { t: "ready", role: o.role === "host" ? "host" : "pad", hostPresent: o.hostPresent === true };
    case "peer":
      return { t: "peer", connected: o.connected === true };
    case "pong":
      return typeof o.ts === "number" ? { t: "pong", ts: o.ts } : null;
    case "err":
      return { t: "err", reason: typeof o.reason === "string" ? o.reason.slice(0, 80) : "error" };
    case "tel": {
      const st = o.st === "crashed" || o.st === "paused" ? o.st : "flying";
      const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? clamp(n, 0, 1) : 0);
      return { t: "tel", st, mode: typeof o.mode === "string" ? o.mode.slice(0, 12) : "", hp: num(o.hp), bat: num(o.bat) };
    }
    default:
      return null;
  }
}

export interface PairingInfo {
  session: string;
  hostToken: string;
  padToken: string;
  expiresAt: number;
  /** LAN IPv4 addresses of the machine running the relay, best guess first. */
  lan: string[];
  port: number;
}

/** URL the phone opens (encoded in the QR). `appOrigin` is the Next.js origin reachable from the phone. */
export function buildPadUrl(appOrigin: string, relayHostPort: string, session: string, padToken: string): string {
  const q = new URLSearchParams({ s: session, t: padToken, r: relayHostPort });
  return `${appOrigin}/pad?${q.toString()}`;
}
