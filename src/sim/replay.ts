import { Quaternion, Vector3 } from "three";

export const REPLAY_HZ = 30;
export const REPLAY_MAX_SECONDS = 300;
const STRIDE = 8; // t, px, py, pz, qx, qy, qz, qw

/**
 * Records the drone pose at a fixed rate and plays it back with interpolation. Stores poses only (not inputs), so a
 * replay is a faithful camera-view playback, not a re-simulation. Memory is bounded: older samples are dropped past
 * REPLAY_MAX_SECONDS.
 */
export class FlightRecorder {
  private data: number[] = [];
  private lastT = Number.NEGATIVE_INFINITY;
  private _q0 = new Quaternion();
  private _q1 = new Quaternion();

  get samples(): number {
    return this.data.length / STRIDE;
  }

  get duration(): number {
    return this.samples < 2 ? 0 : this.data[this.data.length - STRIDE] - this.data[0];
  }

  clear(): void {
    this.data.length = 0;
    this.lastT = Number.NEGATIVE_INFINITY;
  }

  record(t: number, p: Vector3, q: Quaternion): void {
    if (t - this.lastT < 1 / REPLAY_HZ) return;
    this.lastT = t;
    this.data.push(t, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    const max = REPLAY_MAX_SECONDS * REPLAY_HZ * STRIDE;
    if (this.data.length > max) this.data.splice(0, this.data.length - max);
  }

  /** Pose at `time` seconds from the start of the recording (clamped). */
  sample(time: number, outPos: Vector3, outQuat: Quaternion): boolean {
    const n = this.samples;
    if (n === 0) return false;
    const t = this.data[0] + Math.min(Math.max(time, 0), this.duration);
    // binary search for the first sample with time >= t
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.data[mid * STRIDE] < t) lo = mid + 1;
      else hi = mid;
    }
    const i1 = lo;
    const i0 = Math.max(0, i1 - 1);
    const d = this.data;
    const t0 = d[i0 * STRIDE];
    const t1 = d[i1 * STRIDE];
    const a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    const o0 = i0 * STRIDE;
    const o1 = i1 * STRIDE;
    outPos.set(d[o0 + 1] + (d[o1 + 1] - d[o0 + 1]) * a, d[o0 + 2] + (d[o1 + 2] - d[o0 + 2]) * a, d[o0 + 3] + (d[o1 + 3] - d[o0 + 3]) * a);
    this._q0.set(d[o0 + 4], d[o0 + 5], d[o0 + 6], d[o0 + 7]);
    this._q1.set(d[o1 + 4], d[o1 + 5], d[o1 + 6], d[o1 + 7]);
    outQuat.copy(this._q0).slerp(this._q1, a);
    return true;
  }
}
