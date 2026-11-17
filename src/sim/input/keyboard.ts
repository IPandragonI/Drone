import { DEFAULT_KEY_BINDINGS, KEYBOARD_TUNING, type KeyAction, type KeyBindings } from "@/config/controls";
import { clamp } from "./normalize";

/**
 * Keyboard source. Keys are digital, so sticks are slewed toward +-1 / 0 to emulate a transmitter stick
 * (otherwise the drone would receive step inputs). Throttle is integrated and persists like a throttle stick.
 */
export class KeyboardInput {
  private held = new Set<string>();
  private lookup = new Map<string, KeyAction>();
  private current: KeyBindings = DEFAULT_KEY_BINDINGS;
  private pressedQueue: KeyAction[] = [];
  private roll = 0;
  private pitch = 0;
  private yaw = 0;
  throttle = 0;
  private attached: Window | null = null;

  constructor(bindings: KeyBindings = DEFAULT_KEY_BINDINGS) {
    this.setBindings(bindings);
  }

  getBindings(): KeyBindings {
    return this.current;
  }

  setBindings(bindings: KeyBindings): void {
    this.current = bindings;
    this.lookup.clear();
    for (const action of Object.keys(bindings) as KeyAction[]) {
      for (const k of bindings[action]) this.lookup.set(k.toLowerCase(), action);
    }
  }

  attach(target: Window = window): void {
    this.detach();
    target.addEventListener("keydown", this.onDown);
    target.addEventListener("keyup", this.onUp);
    target.addEventListener("blur", this.releaseAll);
    this.attached = target;
  }

  detach(): void {
    if (!this.attached) return;
    this.attached.removeEventListener("keydown", this.onDown);
    this.attached.removeEventListener("keyup", this.onUp);
    this.attached.removeEventListener("blur", this.releaseAll);
    this.attached = null;
    this.releaseAll();
  }

  /** Release every key (window blur, controller loss): never leave stale inputs active. */
  releaseAll = (): void => {
    this.held.clear();
  };

  private onDown = (e: KeyboardEvent): void => {
    const action = this.lookup.get(e.key.toLowerCase());
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) this.pressedQueue.push(action);
    this.held.add(e.key.toLowerCase());
  };

  private onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.key.toLowerCase());
  };

  /** Test/utility hook to simulate key state without DOM events. */
  setKey(key: string, down: boolean): void {
    const k = key.toLowerCase();
    if (down) {
      if (!this.held.has(k)) {
        const a = this.lookup.get(k);
        if (a) this.pressedQueue.push(a);
      }
      this.held.add(k);
    } else this.held.delete(k);
  }

  private isDown(action: KeyAction, bindings = this.lookup): boolean {
    for (const [key, a] of bindings) if (a === action && this.held.has(key)) return true;
    return false;
  }

  /** True while any bound key is held or an unprocessed press is queued. */
  isActive(): boolean {
    return this.held.size > 0 || this.pressedQueue.length > 0;
  }

  /** Actions pressed since last call (edge events: pause, reset, camera, mode ...). */
  drainPressed(): KeyAction[] {
    const q = this.pressedQueue;
    this.pressedQueue = [];
    return q;
  }

  /** Advance slewing by dt and return current stick positions. */
  sample(dt: number): { roll: number; pitch: number; yaw: number; throttle: number } {
    const axis = (neg: KeyAction, pos: KeyAction, cur: number): number => {
      const target = (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
      const rate = target === 0 || Math.sign(target) !== Math.sign(cur) ? KEYBOARD_TUNING.stickFall : KEYBOARD_TUNING.stickRise;
      const step = rate * dt;
      if (cur < target) return Math.min(target, cur + step);
      if (cur > target) return Math.max(target, cur - step);
      return cur;
    };
    this.pitch = axis("pitchBack", "pitchForward", this.pitch);
    this.roll = axis("rollLeft", "rollRight", this.roll);
    this.yaw = axis("yawLeft", "yawRight", this.yaw);

    if (this.isDown("throttleUp")) this.throttle += KEYBOARD_TUNING.throttleRate * dt;
    if (this.isDown("throttleDown")) this.throttle -= KEYBOARD_TUNING.throttleRate * dt;
    this.throttle = clamp(this.throttle, 0, 1);
    return { roll: this.roll, pitch: this.pitch, yaw: this.yaw, throttle: this.throttle };
  }

  /** Immediately neutralise sticks and cut throttle (reset / disconnect). */
  neutralize(): void {
    this.roll = this.pitch = this.yaw = 0;
    this.throttle = 0;
    this.held.clear();
  }
}
