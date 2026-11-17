import { describe, expect, it } from "vitest";
import { buildPadUrl, parsePadMessage, parseRelayMessage } from "./protocol";

describe("parsePadMessage", () => {
  it("accepts a valid stick frame and clamps ranges", () => {
    expect(parsePadMessage('{"t":"in","seq":3,"r":0.5,"p":-0.25,"y":0,"th":0.7}')).toEqual({ t: "in", seq: 3, r: 0.5, p: -0.25, y: 0, th: 0.7 });
    expect(parsePadMessage('{"t":"in","seq":0,"r":9,"p":-9,"y":2,"th":5}')).toEqual({ t: "in", seq: 0, r: 1, p: -1, y: 1, th: 1 });
    expect(parsePadMessage('{"t":"in","seq":0,"r":0,"p":0,"y":0,"th":-3}')).toMatchObject({ th: 0 });
  });
  it("rejects malformed input", () => {
    expect(parsePadMessage("not json")).toBeNull();
    expect(parsePadMessage("null")).toBeNull();
    expect(parsePadMessage("[]")).toBeNull();
    expect(parsePadMessage('{"t":"in","seq":1,"r":"0.5","p":0,"y":0,"th":0}')).toBeNull(); // string, not number
    expect(parsePadMessage('{"t":"in","seq":1.5,"r":0,"p":0,"y":0,"th":0}')).toBeNull(); // non-integer seq
    expect(parsePadMessage('{"t":"in","seq":-1,"r":0,"p":0,"y":0,"th":0}')).toBeNull();
    expect(parsePadMessage('{"t":"in","seq":1,"r":0,"p":0,"y":0}')).toBeNull(); // missing field
    expect(parsePadMessage('{"t":"in","seq":1,"r":1e999,"p":0,"y":0,"th":0}')).toBeNull(); // Infinity
    expect(parsePadMessage('{"t":"boom"}')).toBeNull();
    expect(parsePadMessage("x".repeat(600))).toBeNull(); // too large
  });
  it("accepts only whitelisted actions", () => {
    expect(parsePadMessage('{"t":"act","a":"reset"}')).toEqual({ t: "act", a: "reset" });
    expect(parsePadMessage('{"t":"act","a":"throttleCut"}')).toBeNull();
    expect(parsePadMessage('{"t":"act","a":"__proto__"}')).toBeNull();
    expect(parsePadMessage('{"t":"act"}')).toBeNull();
  });
});

describe("parseRelayMessage", () => {
  it("parses known messages and ignores unknown ones", () => {
    expect(parseRelayMessage('{"t":"peer","connected":true}')).toEqual({ t: "peer", connected: true });
    expect(parseRelayMessage('{"t":"pong","ts":12}')).toEqual({ t: "pong", ts: 12 });
    expect(parseRelayMessage('{"t":"tel","st":"crashed","mode":"acro","hp":2,"bat":0.5}')).toEqual({ t: "tel", st: "crashed", mode: "acro", hp: 1, bat: 0.5 });
    expect(parseRelayMessage('{"t":"zzz"}')).toBeNull();
    expect(parseRelayMessage("{")).toBeNull();
  });
});

describe("signalling messages", () => {
  it("accepts offer/answer/ice objects and rejects junk", () => {
    expect(parseRelayMessage('{"t":"sig","k":"offer","d":{"type":"offer","sdp":"v=0"}}')).toEqual({ t: "sig", k: "offer", d: { type: "offer", sdp: "v=0" } });
    expect(parseRelayMessage('{"t":"sig","k":"ice","d":{"candidate":"x"}}')).toMatchObject({ t: "sig", k: "ice" });
    expect(parseRelayMessage('{"t":"sig","k":"bogus","d":{}}')).toBeNull();
    expect(parseRelayMessage('{"t":"sig","k":"offer","d":"str"}')).toBeNull();
    expect(parseRelayMessage('{"t":"sig","k":"offer","d":[1]}')).toBeNull();
    expect(parseRelayMessage('{"t":"sig","k":"offer","d":{"sdp":"' + "a".repeat(13000) + '"}}')).toBeNull();
  });
  it("is never mistaken for a stick frame", () => {
    expect(parsePadMessage('{"t":"sig","k":"offer","d":{}}')).toBeNull();
  });
});

describe("buildPadUrl", () => {
  it("encodes session, token and relay address", () => {
    const u = new URL(buildPadUrl("http://192.168.1.5:3000", "192.168.1.5:3101", "ABC234", "deadbeef"));
    expect(u.pathname).toBe("/pad");
    expect(u.searchParams.get("s")).toBe("ABC234");
    expect(u.searchParams.get("t")).toBe("deadbeef");
    expect(u.searchParams.get("r")).toBe("192.168.1.5:3101");
  });
});
