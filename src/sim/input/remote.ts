import type { KeyAction } from "@/config/controls";
import type { PadActionName, PadToHost } from "@/net/protocol";

/** A phone that stops sending for this long is treated as lost (frames normally arrive every ~20 ms). */
export const REMOTE_STALE_MS = 300;
/** Phone throttle must come within this distance of the carried-over throttle before it takes control. */
export const THROTTLE_SYNC_TOLERANCE = 0.08;

const ACTION_MAP: Record<PadActionName, KeyAction> = {
  reset: "reset",
  pause: "pause",
  toggleCamera: "toggleCamera",
  toggleHud: "toggleHud",
  modeCycle: "modeCycle",
};

/**
 * Input source fed by the phone controller. Independent of the network layer: the host link calls `apply` with
 * validated messages; the session calls `sample` once per frame.
 * Failsafe: if the pad is disconnected or silent for REMOTE_STALE_MS, sticks go neutral and throttle drops to 0.
 */
export class RemoteInput {
  /** Pad attached at the relay (set by the host link). */
  connected = false;
  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  private rawThrottle = 0;
  private lastSeq = -1;
  private lastAt = Number.NEGATIVE_INFINITY;
  private lastSampleAt = Number.NaN;
  /** Silence tolerated before the link counts as lost: REMOTE_STALE_MS, or more if the host itself is running slowly. */
  private staleAfter = REMOTE_STALE_MS;
  private activity = false;
  private pressed: KeyAction[] = [];
  private lockTarget: number | null = null;
  /** Throttle actually used (differs from the phone's stick while a hand-over lock is active). */
  throttle = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.lastSeq = -1; // a reconnecting pad restarts its sequence numbers
    this.lastAt = Number.NEGATIVE_INFINITY;
    if (!connected) this.neutralize();
  }

  apply(msg: PadToHost): void {
    if (!this.connected) return;
    if (msg.t === "act") {
      this.pressed.push(ACTION_MAP[msg.a]);
      this.activity = true;
      return;
    }
    if (msg.seq <= this.lastSeq) return; // drop reordered/duplicate frames
    this.lastSeq = msg.seq;
    this.lastAt = this.now();
    const moved = Math.abs(msg.r) + Math.abs(msg.p) + Math.abs(msg.y) > 0.02 || Math.abs(msg.th - this.rawThrottle) > 0.02;
    this.roll = msg.r;
    this.pitch = msg.p;
    this.yaw = msg.y;
    this.rawThrottle = msg.th;
    if (moved) this.activity = true;
  }

  /** True when the pad has been silent too long (or is gone). */
  isStale(): boolean {
    return !this.connected || this.now() - this.lastAt > this.staleAfter;
  }

  /** Whether the phone did something since last call (used to switch the active device). */
  hadActivity(): boolean {
    const a = this.activity;
    this.activity = false;
    return a && this.connected;
  }

  drainPressed(): KeyAction[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  /** Hold `target` as the output throttle until the phone's throttle stick reaches it (no jump on hand-over). */
  syncThrottle(target: number): void {
    this.lockTarget = target > THROTTLE_SYNC_TOLERANCE ? target : null;
    this.throttle = target;
  }

  neutralize(): void {
    this.roll = this.pitch = this.yaw = 0;
    this.rawThrottle = 0;
    this.throttle = 0;
    this.lockTarget = null;
  }

  sample(): { roll: number; pitch: number; yaw: number; throttle: number; stale: boolean } {
    // A slow host (frames far apart) must not read its own stalls as link loss: scale the timeout with the host frame gap.
    const now = this.now();
    const gap = Number.isNaN(this.lastSampleAt) ? 0 : now - this.lastSampleAt;
    this.lastSampleAt = now;
    this.staleAfter = Math.max(REMOTE_STALE_MS, 3 * gap);
    if (this.isStale()) {
      this.throttle = 0;
      this.lockTarget = null;
      return { roll: 0, pitch: 0, yaw: 0, throttle: 0, stale: true };
    }
    if (this.lockTarget !== null) {
      if (Math.abs(this.rawThrottle - this.lockTarget) <= THROTTLE_SYNC_TOLERANCE) this.lockTarget = null;
      else {
        this.throttle = this.lockTarget;
        return { roll: this.roll, pitch: this.pitch, yaw: this.yaw, throttle: this.throttle, stale: false };
      }
    }
    this.throttle = this.rawThrottle;
    return { roll: this.roll, pitch: this.pitch, yaw: this.yaw, throttle: this.throttle, stale: false };
  }
}
