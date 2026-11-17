import { describe, expect, it } from "vitest";
import { GamepadInput } from "./gamepad";
import { KeyboardInput } from "./keyboard";
import { InputManager } from "./manager";
import { REMOTE_STALE_MS, RemoteInput } from "./remote";
import { DEFAULT_GAMEPAD_PROFILE } from "@/config/controlSettings";
import type { PadFrame } from "@/net/protocol";

const frame = (seq: number, r = 0, p = 0, y = 0, th = 0): PadFrame => ({ t: "in", seq, r, p, y, th });

function setup() {
  let t = 1000;
  const remote = new RemoteInput(() => t);
  const keyboard = new KeyboardInput();
  const gamepad = new GamepadInput(structuredClone(DEFAULT_GAMEPAD_PROFILE), () => []);
  const mgr = new InputManager(keyboard, gamepad, remote);
  return { remote, keyboard, mgr, advance: (ms: number) => (t += ms) };
}

describe("RemoteInput", () => {
  it("ignores frames until a pad is connected", () => {
    const { remote } = setup();
    remote.apply(frame(0, 1, 1, 1, 1));
    expect(remote.sample()).toMatchObject({ roll: 0, throttle: 0, stale: true });
  });

  it("passes sticks through and drops reordered frames", () => {
    const { remote } = setup();
    remote.setConnected(true);
    remote.apply(frame(5, 0.5, -0.5, 0.25, 0.6));
    remote.apply(frame(4, 1, 1, 1, 1)); // older -> ignored
    expect(remote.sample()).toEqual({ roll: 0.5, pitch: -0.5, yaw: 0.25, throttle: 0.6, stale: false });
  });

  it("fails safe to neutral + zero throttle when frames stop (stale timeout)", () => {
    const { remote, advance } = setup();
    remote.setConnected(true);
    remote.apply(frame(1, 0.8, 0.8, 0.8, 0.7));
    advance(REMOTE_STALE_MS - 20);
    expect(remote.sample().throttle).toBe(0.7);
    advance(40);
    expect(remote.sample()).toEqual({ roll: 0, pitch: 0, yaw: 0, throttle: 0, stale: true });
  });

  it("recovers after reconnect with restarted sequence numbers", () => {
    const { remote } = setup();
    remote.setConnected(true);
    remote.apply(frame(900, 0, 0, 0, 0.5));
    remote.setConnected(false);
    expect(remote.sample().stale).toBe(true);
    remote.setConnected(true);
    remote.apply(frame(0, 0, 0, 0, 0.4)); // seq restarts at 0
    expect(remote.sample()).toMatchObject({ throttle: 0.4, stale: false });
  });

  it("queues action presses once", () => {
    const { remote } = setup();
    remote.setConnected(true);
    remote.apply({ t: "act", a: "reset" });
    remote.apply({ t: "act", a: "modeCycle" });
    expect(remote.drainPressed()).toEqual(["reset", "modeCycle"]);
    expect(remote.drainPressed()).toEqual([]);
  });
});

describe("RemoteInput on a slow host", () => {
  it("does not mistake its own long frames for link loss, but still detects a genuinely silent link", () => {
    const { remote, advance } = setup();
    remote.setConnected(true);
    remote.apply(frame(1, 0.2, 0, 0, 0.5));
    remote.sample();
    for (let i = 2; i < 10; i++) {
      advance(350); // ~3 fps host; the phone keeps sending
      remote.apply(frame(i, 0.2, 0, 0, 0.5));
      expect(remote.sample().stale).toBe(false);
    }
    for (let i = 0; i < 12; i++) advance(350); // phone goes silent while the host keeps ticking slowly
    let stale = false;
    for (let i = 0; i < 6 && !stale; i++) {
      advance(350);
      stale = remote.sample().stale;
    }
    expect(stale).toBe(true);
  });
});

describe("InputManager with phone", () => {
  it("switches to the phone on activity and falls back safely when it goes silent", () => {
    const { remote, mgr, advance } = setup();
    remote.setConnected(true);
    remote.apply(frame(1, 0.5, 0, 0, 0));
    let s = mgr.sample(1 / 60);
    expect(s.device).toBe("phone");
    expect(s.roll).toBe(0.5);

    for (let i = 0; i < 30; i++) {
      advance(16); // a healthy host keeps ticking at ~60 Hz while the phone is silent
      s = mgr.sample(1 / 60);
    }
    expect(s).toMatchObject({ device: "keyboard", roll: 0, throttle: 0 });
    expect(mgr.active).toBe("keyboard");
  });

  it("does not jump throttle when handing over from the keyboard", () => {
    const { remote, keyboard, mgr, advance } = setup();
    keyboard.throttle = 0.55;
    remote.setConnected(true);
    remote.apply(frame(1, 0.3, 0, 0, 0.0)); // phone throttle stick is at the bottom
    let s = mgr.sample(1 / 60);
    expect(s.device).toBe("phone");
    expect(s.throttle).toBeCloseTo(0.55); // held, not dropped to 0
    advance(20);
    remote.apply(frame(2, 0.3, 0, 0, 0.3));
    expect(mgr.sample(1 / 60).throttle).toBeCloseTo(0.55); // still locked
    advance(20);
    remote.apply(frame(3, 0.3, 0, 0, 0.53)); // within tolerance of the held value -> phone takes over
    s = mgr.sample(1 / 60);
    expect(s.throttle).toBeCloseTo(0.53);
    advance(20);
    remote.apply(frame(4, 0.3, 0, 0, 0.2));
    expect(mgr.sample(1 / 60).throttle).toBeCloseTo(0.2);
  });

  it("hands control back to the keyboard with the phone's throttle", () => {
    const { remote, keyboard, mgr, advance } = setup();
    remote.setConnected(true);
    remote.apply(frame(1, 0, 0, 0, 0.4));
    mgr.sample(1 / 60);
    expect(mgr.active).toBe("phone");
    advance(20);
    remote.apply(frame(2, 0, 0, 0, 0.4));
    keyboard.setKey("z", true); // pitch forward key (default bindings)
    const s = mgr.sample(1 / 60);
    expect(s.device).toBe("keyboard");
    expect(s.throttle).toBeCloseTo(0.4);
  });
});
