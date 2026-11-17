import type { KeyAction } from "@/config/controls";
import { GamepadInput } from "./gamepad";
import { KeyboardInput } from "./keyboard";
import { RemoteInput } from "./remote";

export type InputDevice = "keyboard" | "gamepad" | "phone";

/**
 * Combines devices into one control stream. The device that was used most recently is active;
 * throttle is carried over on switch so there is no jump. A disconnected pad yields neutral sticks and zero throttle.
 */
export class InputManager {
  active: InputDevice = "keyboard";

  constructor(
    readonly keyboard: KeyboardInput,
    readonly gamepad: GamepadInput,
    readonly remote: RemoteInput = new RemoteInput(),
  ) {}

  private activeThrottle(): number {
    return this.active === "gamepad" ? this.gamepad.throttle : this.active === "phone" ? this.remote.throttle : this.keyboard.throttle;
  }

  /** Edge actions (reset, pause, camera ...) from every device. */
  drainPressed(): KeyAction[] {
    return [...this.keyboard.drainPressed(), ...this.gamepad.drainPressed(), ...this.remote.drainPressed()];
  }

  sample(dt: number): { roll: number; pitch: number; yaw: number; throttle: number; device: InputDevice } {
    const wasConnected = this.gamepad.connected;
    const kb = this.keyboard.sample(dt);
    const gp = this.gamepad.sample(dt);
    const rm = this.remote.sample();

    if (wasConnected && !this.gamepad.connected && this.active === "gamepad") {
      // Pad lost while active: fail safe to neutral; keyboard takes over with throttle cut.
      this.active = "keyboard";
      this.keyboard.neutralize();
      return { roll: 0, pitch: 0, yaw: 0, throttle: 0, device: "keyboard" };
    }
    if (this.active === "phone" && rm.stale) {
      // Phone lost or silent while active: fail safe to neutral; keyboard takes over with throttle cut.
      this.active = "keyboard";
      this.keyboard.neutralize();
      return { roll: 0, pitch: 0, yaw: 0, throttle: 0, device: "keyboard" };
    }
    if (this.keyboard.isActive() && this.active !== "keyboard") {
      this.keyboard.throttle = this.activeThrottle();
      this.active = "keyboard";
    } else if (this.gamepad.connected && this.gamepad.hadActivity() && this.active !== "gamepad") {
      this.gamepad.throttle = this.activeThrottle();
      this.active = "gamepad";
    } else if (this.remote.hadActivity() && this.active !== "phone") {
      this.remote.syncThrottle(this.activeThrottle());
      this.active = "phone";
    }
    if (this.active === "phone") {
      const r = this.remote.sample();
      return { roll: r.roll, pitch: r.pitch, yaw: r.yaw, throttle: r.throttle, device: "phone" };
    }
    // Re-read throttle after a possible hand-over so the switching frame never drops or jumps.
    if (this.active === "gamepad") return { ...gp, throttle: this.gamepad.throttle, device: "gamepad" };
    return { ...kb, throttle: this.keyboard.throttle, device: "keyboard" };
  }

  neutralize(): void {
    this.keyboard.neutralize();
    this.gamepad.throttle = 0;
    this.remote.neutralize();
  }
}
