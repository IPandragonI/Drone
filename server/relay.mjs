// Local relay for the phone controller (Phase 3).
// Next.js route handlers cannot host WebSockets, so this runs as a separate Node process: `npm run relay`.
//
//   POST /session  (local machine only)  -> { session, hostToken, padToken, expiresAt, lan, port }
//   GET  /info                           -> { lan, port }
//   WS   /ws?role=host&s=CODE&t=HOSTTOKEN   the simulator page
//   WS   /ws?role=pad&s=CODE&t=PADTOKEN     the phone
//
// The relay authenticates, then forwards pad frames to the host and telemetry back. It does not interpret stick data
// (the host validates it). Security model: LAN only, unencrypted ws://, short-lived random tokens. See docs.

import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import os from "node:os";
import { WebSocketServer } from "ws";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const FORWARD_FROM_PAD = new Set(["in", "act", "sig"]);
const MAX_PAYLOAD = 16 * 1024;
const MAX_SIGNAL_CHARS = 12_000;
const MAX_PAD_MSGS_PER_SEC = 240;
const HOST_GRACE_MS = 15_000;

function randomCode(len) {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** IPv4 addresses of this machine, private LAN ranges first, link-local (169.254) last. */
export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
  }
  const rank = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : ip.startsWith("169.254.") ? 4 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

function isLocalAddress(addr) {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/, "");
  if (a === "127.0.0.1" || a === "::1") return true;
  return lanAddresses().includes(a);
}

export function createRelay({ port = 3101, host = "0.0.0.0", tokenTtlMs = 10 * 60_000, now = () => Date.now(), sweepMs = 5_000 } = {}) {
  /** @type {Map<string, any>} */
  const sessions = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  let boundPort = port;

  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && url.pathname === "/info") return json(res, 200, { lan: lanAddresses(), port: boundPort });
    if (req.method === "POST" && url.pathname === "/session") {
      if (!isLocalAddress(req.socket.remoteAddress)) return json(res, 403, { error: "sessions can only be created from the machine running the simulator" });
      let code = randomCode(6);
      while (sessions.has(code)) code = randomCode(6);
      const s = {
        code,
        hostToken: randomBytes(16).toString("hex"),
        padToken: randomBytes(16).toString("hex"),
        expiresAt: now() + tokenTtlMs,
        host: null,
        pad: null,
        hostGoneAt: null,
      };
      sessions.set(code, s);
      return json(res, 200, { session: code, hostToken: s.hostToken, padToken: s.padToken, expiresAt: s.expiresAt, lan: lanAddresses(), port: boundPort });
    }
    json(res, 404, { error: "not found" });
  });

  const send = (ws, msg) => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  function closeSession(s, reason) {
    for (const ws of [s.host, s.pad]) {
      if (ws) {
        send(ws, { t: "err", reason });
        ws.close(4004, reason);
      }
    }
    sessions.delete(s.code);
  }

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, url, req));
  });

  function onConnection(ws, url, req) {
    const role = url.searchParams.get("role");
    const s = sessions.get(url.searchParams.get("s") ?? "");
    const token = url.searchParams.get("t") ?? "";
    const deny = (reason) => {
      send(ws, { t: "err", reason });
      ws.close(4003, reason);
    };
    if (!s || (role !== "host" && role !== "pad")) return deny("unknown session");
    if (now() > s.expiresAt) {
      closeSession(s, "expired");
      return deny("expired");
    }
    if (role === "host") {
      if (!isLocalAddress(req.socket.remoteAddress)) return deny("forbidden");
      if (!safeEqual(token, s.hostToken)) return deny("bad token");
      if (s.host) s.host.close(4001, "replaced");
      s.host = ws;
      s.hostGoneAt = null;
      send(ws, { t: "ready", role: "host" });
      if (s.pad) send(ws, { t: "peer", connected: true });
      ws.on("message", (data) => {
        // Host -> pad: telemetry and WebRTC signaling only.
        const txt = data.toString();
        if (!s.pad) return;
        if (txt.length < 256 && txt.startsWith('{"t":"tel"')) s.pad.send(txt);
        else if (txt.length <= MAX_SIGNAL_CHARS && txt.startsWith('{"t":"sig"')) s.pad.send(txt);
      });
      ws.on("close", () => {
        if (s.host !== ws) return;
        s.host = null;
        s.hostGoneAt = now();
        send(s.pad, { t: "peer", connected: false });
      });
      return;
    }
    // pad
    if (!safeEqual(token, s.padToken)) return deny("bad token");
    if (s.pad) s.pad.close(4001, "replaced");
    s.pad = ws;
    s.expiresAt = now() + tokenTtlMs;
    send(ws, { t: "ready", role: "pad", hostPresent: !!s.host });
    send(s.host, { t: "peer", connected: true });
    let windowStart = now();
    let count = 0;
    ws.on("message", (data) => {
      const t = now();
      if (t - windowStart >= 1000) {
        windowStart = t;
        count = 0;
      }
      if (++count > MAX_PAD_MSGS_PER_SEC) return; // drop flood, keep connection
      s.expiresAt = t + tokenTtlMs;
      const txt = data.toString();
      let msg;
      try {
        msg = JSON.parse(txt);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "ping") return send(ws, { t: "pong", ts: Number(msg.ts) || 0 });
      if (!FORWARD_FROM_PAD.has(msg.t) || !s.host || s.host.readyState !== 1) return;
      if (msg.t === "sig" ? txt.length <= MAX_SIGNAL_CHARS : txt.length <= 512) s.host.send(txt);
    });
    ws.on("close", () => {
      if (s.pad !== ws) return; // replaced by a newer connection
      s.pad = null;
      send(s.host, { t: "peer", connected: false });
    });
  }

  const sweeper = setInterval(() => {
    const t = now();
    for (const s of [...sessions.values()]) {
      if (t > s.expiresAt) closeSession(s, "expired");
      else if (s.hostGoneAt !== null && t - s.hostGoneAt > HOST_GRACE_MS) closeSession(s, "host left");
    }
  }, sweepMs);
  sweeper.unref();

  return {
    sessions,
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          boundPort = server.address().port;
          resolve(boundPort);
        });
      });
    },
    close() {
      clearInterval(sweeper);
      for (const s of sessions.values()) for (const ws of [s.host, s.pad]) ws?.terminate();
      sessions.clear();
      return new Promise((resolve) => {
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
