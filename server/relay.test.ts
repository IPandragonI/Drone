// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createRelay } from "./relay.mjs";

interface Pairing {
  session: string;
  hostToken: string;
  padToken: string;
  expiresAt: number;
}

let relay: ReturnType<typeof createRelay>;
let port: number;
let clock = 1_000_000;
const sockets: WebSocket[] = [];

async function newSession(): Promise<Pairing> {
  const r = await fetch(`http://127.0.0.1:${port}/session`, { method: "POST" });
  expect(r.status).toBe(200);
  return r.json();
}

/** Open a socket and collect messages; resolves once open. */
function open(role: "host" | "pad", s: string, t: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?role=${role}&s=${s}&t=${t}`);
  sockets.push(ws);
  const msgs: Array<Record<string, unknown>> = [];
  const closed = new Promise<number>((res) => ws.on("close", (code) => res(code)));
  ws.on("message", (d) => msgs.push(JSON.parse(d.toString())));
  const opened = new Promise<void>((res, rej) => {
    ws.on("open", () => res());
    ws.on("error", rej);
  });
  return { ws, msgs, closed, opened };
}

const until = async (cond: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
};

beforeEach(async () => {
  clock = 1_000_000;
  relay = createRelay({ port: 0, host: "127.0.0.1", tokenTtlMs: 60_000, now: () => clock, sweepMs: 3_600_000 });
  port = await relay.start();
});

afterEach(async () => {
  sockets.splice(0).forEach((w) => w.terminate());
  await relay.close();
});

describe("relay", () => {
  it("creates sessions with distinct random tokens", async () => {
    const a = await newSession();
    const b = await newSession();
    expect(a.session).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.hostToken).not.toBe(a.padToken);
    expect(a.hostToken).toHaveLength(32);
    expect(a.session).not.toBe(b.session);
    expect(a.padToken).not.toBe(b.padToken);
  });

  it("forwards pad frames to the host and telemetry back; answers pings", async () => {
    const p = await newSession();
    const host = open("host", p.session, p.hostToken);
    await host.opened;
    const pad = open("pad", p.session, p.padToken);
    await pad.opened;
    await until(() => host.msgs.some((m) => m.t === "peer" && m.connected));
    expect(pad.msgs[0]).toMatchObject({ t: "ready", role: "pad", hostPresent: true });

    pad.ws.send('{"t":"in","seq":1,"r":0.5,"p":0,"y":0,"th":0.3}');
    pad.ws.send('{"t":"act","a":"reset"}');
    pad.ws.send('{"t":"evil","x":1}'); // not forwarded
    pad.ws.send("garbage"); // ignored
    pad.ws.send('{"t":"ping","ts":42}');
    await until(() => host.msgs.filter((m) => m.t === "in" || m.t === "act").length === 2);
    expect(host.msgs.some((m) => m.t === "evil")).toBe(false);
    await until(() => pad.msgs.some((m) => m.t === "pong" && m.ts === 42));

    host.ws.send('{"t":"tel","st":"flying","mode":"acro","hp":1,"bat":0.9}');
    await until(() => pad.msgs.some((m) => m.t === "tel"));
  });

  it("relays WebRTC signalling both ways but drops oversized or unknown host messages", async () => {
    const p = await newSession();
    const host = open("host", p.session, p.hostToken);
    await host.opened;
    const pad = open("pad", p.session, p.padToken);
    await pad.opened;
    await until(() => host.msgs.some((m) => m.t === "peer"));
    host.ws.send('{"t":"sig","k":"offer","d":{"type":"offer","sdp":"v=0"}}');
    host.ws.send('{"t":"in","seq":1,"r":1,"p":1,"y":1,"th":1}'); // host may not inject sticks to the pad
    await until(() => pad.msgs.some((m) => m.t === "sig" && m.k === "offer"));
    pad.ws.send('{"t":"sig","k":"answer","d":{"type":"answer","sdp":"v=0"}}');
    await until(() => host.msgs.some((m) => m.t === "sig" && m.k === "answer"));
    host.ws.send('{"t":"sig","k":"ice","d":{"candidate":"' + "x".repeat(13000) + '"}}');
    await new Promise((r) => setTimeout(r, 150));
    expect(pad.msgs.filter((m) => m.t === "sig")).toHaveLength(1);
    expect(pad.msgs.some((m) => m.t === "in")).toBe(false);
  });

  it("rejects bad tokens, wrong roles for a token and unknown sessions", async () => {
    const p = await newSession();
    for (const [role, s, t] of [
      ["pad", p.session, p.hostToken],
      ["host", p.session, p.padToken],
      ["pad", p.session, "x"],
      ["pad", "ZZZZZZ", p.padToken],
    ] as const) {
      const c = open(role, s, t);
      await c.opened;
      expect(await c.closed).toBe(4003);
      expect(c.msgs[0]).toMatchObject({ t: "err" });
    }
  });

  it("expires tokens after the TTL", async () => {
    const p = await newSession();
    clock += 61_000;
    const c = open("pad", p.session, p.padToken);
    await c.opened;
    expect(await c.closed).toBe(4003);
    expect(c.msgs[0]).toMatchObject({ t: "err", reason: "expired" });
  });

  it("lets a pad reconnect (newer connection replaces older) and tells the host", async () => {
    const p = await newSession();
    const host = open("host", p.session, p.hostToken);
    await host.opened;
    const pad1 = open("pad", p.session, p.padToken);
    await pad1.opened;
    await until(() => host.msgs.filter((m) => m.t === "peer" && m.connected).length === 1);
    const pad2 = open("pad", p.session, p.padToken);
    await pad2.opened;
    expect(await pad1.closed).toBe(4001);
    await until(() => host.msgs.filter((m) => m.t === "peer" && m.connected).length === 2);
    pad2.ws.send('{"t":"in","seq":0,"r":0,"p":0,"y":0,"th":0.1}');
    await until(() => host.msgs.some((m) => m.t === "in"));
    // The replaced socket closing must not report the pad as disconnected.
    expect(host.msgs.some((m) => m.t === "peer" && !m.connected)).toBe(false);
  });

  it("notifies the host when the pad drops", async () => {
    const p = await newSession();
    const host = open("host", p.session, p.hostToken);
    await host.opened;
    const pad = open("pad", p.session, p.padToken);
    await pad.opened;
    await until(() => host.msgs.some((m) => m.t === "peer" && m.connected));
    pad.ws.terminate();
    await until(() => host.msgs.some((m) => m.t === "peer" && !m.connected));
  });

  it("drops floods beyond the rate limit but keeps the connection", async () => {
    const p = await newSession();
    const host = open("host", p.session, p.hostToken);
    await host.opened;
    const pad = open("pad", p.session, p.padToken);
    await pad.opened;
    await until(() => host.msgs.some((m) => m.t === "peer"));
    const started = Date.now();
    for (let i = 0; i < 1000; i++) pad.ws.send(`{"t":"in","seq":${i},"r":0,"p":0,"y":0,"th":0}`);
    await new Promise((r) => setTimeout(r, 300));
    const got = host.msgs.filter((m) => m.t === "in").length;
    // The limit is per one-second window; on a loaded machine the burst can straddle windows.
    const windows = Math.floor((Date.now() - started) / 1000) + 1;
    expect(got).toBeLessThanOrEqual(240 * (windows + 1));
    expect(got).toBeLessThan(1000);
    expect(got).toBeGreaterThan(0);
    expect(pad.ws.readyState).toBe(WebSocket.OPEN);
  });
});
