import { Quaternion, Vector3 } from "three";
import { DEFAULT_CONTROL_SETTINGS, type ControlSettings } from "@/config/controlSettings";
import { GamepadInput } from "./input/gamepad";
import { InputManager, type InputDevice } from "./input/manager";
import { KeyboardInput } from "./input/keyboard";
import { RemoteInput } from "./input/remote";
import { normalizeInput } from "./input/normalize";
import type { MissionResult, MissionStatus } from "@/missions/types";
import { MissionRunner, scaleMission } from "@/missions/runner";
import { BOUNDS_GRACE_S, boundsState, type BoundsState } from "./bounds";
import { FlightRecorder } from "./replay";
import type { Simulation } from "./simulation";
import type { FlightMode } from "./types";

export type CameraMode = "fpv" | "chase";

export interface ViewState {
  cameraMode: CameraMode;
  hudVisible: boolean;
  mode: FlightMode;
  status: "flying" | "crashed" | "paused";
  launched: boolean;
  replaying: boolean;
  /** Flight-area state and, when outside, whole seconds left before the flight ends. */
  bounds: BoundsState;
  boundsSecondsLeft: number;
  /** Human-readable reason for the last crash (null while flying). */
  crashReason: string | null;
  missionStatus: MissionStatus | null;
}

/**
 * Glue between input devices and the simulation, independent of React.
 * Owns view toggles (camera, HUD, flight mode). The render layer reads `pose` each frame.
 */
export class FlightSession {
  readonly keyboard = new KeyboardInput();
  readonly gamepad: GamepadInput;
  readonly remote = new RemoteInput();
  readonly input: InputManager;
  readonly pose = { position: new Vector3(), quaternion: new Quaternion() };
  cameraMode: CameraMode = "fpv";
  hudVisible = true;
  launched = false;
  /** Active mission (null in free flight). */
  mission: MissionRunner | null = null;
  /** Called once when the mission completes or fails. */
  onMissionEnd: ((r: MissionResult) => void) | null = null;
  readonly recorder = new FlightRecorder();
  replaying = false;
  private replayT = 0;
  private cameraBeforeReplay: CameraMode = "fpv";
  private crashAt: number | null = null;
  private boundsNow: BoundsState = "ok";
  private outTimer = 0;
  private secondsShown = BOUNDS_GRACE_S;
  crashReason: string | null = null;
  private flightTimeAcc = 0;
  private collisionCount = 0;
  private crashCount = 0;
  /** Device currently driving the sticks. */
  get device(): InputDevice {
    return this.input.active;
  }
  private subs = new Set<(v: ViewState) => void>();
  private unsubSim: Array<() => void> = [];

  constructor(
    readonly sim: Simulation,
    settings: ControlSettings = DEFAULT_CONTROL_SETTINGS,
  ) {
    this.gamepad = new GamepadInput(structuredClone(settings.gamepad));
    this.input = new InputManager(this.keyboard, this.gamepad, this.remote);
    this.unsubSim.push(sim.on("status", () => this.notify()));
    this.unsubSim.push(
      sim.on("collision", (e) => {
        this.collisionCount++;
        this.mission?.onCollision(e.severity);
      }),
    );
    this.unsubSim.push(
      sim.on("crash", (e) => {
        this.crashCount++;
        this.crashReason = "reason" in e ? (e.reason === "out-of-bounds" ? "Fell out of the world" : e.reason) : `Hard impact (${e.impactSpeed.toFixed(0)} m/s)`;
        this.notify();
      }),
    );
    this.sim.getRenderPose(this.pose.position, this.pose.quaternion);
  }

  attach(target: Window): void {
    this.keyboard.attach(target);
  }

  dispose(): void {
    this.keyboard.detach();
    this.unsubSim.forEach((u) => u());
    this.subs.clear();
    this.sim.dispose();
  }

  subscribe(cb: (v: ViewState) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  getViewState(): ViewState {
    return {
      cameraMode: this.cameraMode,
      hudVisible: this.hudVisible,
      mode: this.sim.mode,
      status: this.sim.status,
      launched: this.launched,
      replaying: this.replaying,
      bounds: this.boundsNow,
      boundsSecondsLeft: this.secondsShown,
      crashReason: this.sim.crashed ? this.crashReason : null,
      missionStatus: this.mission?.status ?? null,
    };
  }

  /** Totals for the stats screen: airborne seconds, crashes and impacts since this session started. */
  getFlightTotals(): { time: number; crashes: number; collisions: number } {
    return { time: this.flightTimeAcc + (this.launched ? this.sim.flightTime : 0), crashes: this.crashCount, collisions: this.collisionCount };
  }

  setMission(def: import("@/missions/types").MissionDef | null, difficulty: import("@/missions/types").Difficulty = "normal"): void {
    this.mission = def ? new MissionRunner(scaleMission(def, difficulty), difficulty) : null;
    this.notify();
  }

  /** Reset to the spawn point (the same thing the Reset key does). */
  restart(): void {
    this.stopReplay();
    this.input.neutralize();
    this.flightTimeAcc += this.launched ? this.sim.flightTime : 0;
    this.sim.reset();
    this.launched = false;
    this.mission?.reset();
    this.recorder.clear();
    this.crashAt = null;
    this.crashReason = null;
    this.outTimer = 0;
    this.boundsNow = "ok";
    this.secondsShown = BOUNDS_GRACE_S;
    this.notify();
  }

  togglePauseUi(): void {
    if (!this.replaying && !this.sim.crashed) this.sim.togglePause();
  }

  private startReplay(): void {
    if (this.replaying || this.recorder.duration < 1) return;
    this.replaying = true;
    this.replayT = 0;
    this.cameraBeforeReplay = this.cameraMode;
    this.cameraMode = "chase";
    this.input.neutralize();
  }

  private stopReplay(): void {
    if (!this.replaying) return;
    this.replaying = false;
    this.cameraMode = this.cameraBeforeReplay;
    this.sim.getRenderPose(this.pose.position, this.pose.quaternion);
  }

  private notify(): void {
    const v = this.getViewState();
    this.subs.forEach((cb) => cb(v));
  }

  /** Make the sim safe when the window loses focus or becomes hidden. */
  suspend(): void {
    this.input.neutralize();
    if (!this.sim.paused && !this.sim.crashed) this.sim.togglePause();
  }

  /** Per-frame update: process edge actions, sample sticks, advance the simulation, publish pose. */
  tick(dt: number): void {
    let changed = false;
    for (const action of this.input.drainPressed()) {
      switch (action) {
        case "replay":
          if (this.replaying) this.stopReplay();
          else this.startReplay();
          changed = true;
          break;
        case "pause":
          if (!this.replaying && !this.sim.crashed) this.sim.togglePause();
          break;
        case "reset":
          this.restart();
          changed = true;
          break;
        case "toggleCamera":
          this.cameraMode = this.cameraMode === "fpv" ? "chase" : "fpv";
          changed = true;
          break;
        case "toggleHud":
          this.hudVisible = !this.hudVisible;
          changed = true;
          break;
        case "modeAngle":
        case "modeHorizon":
        case "modeAcro": {
          if (this.replaying) break;
          const m = action === "modeAngle" ? "angle" : action === "modeHorizon" ? "horizon" : "acro";
          this.sim.setMode(m);
          changed = true;
          break;
        }
        case "modeCycle": {
          if (this.replaying) break;
          const modes = this.sim.drone.flightModes;
          this.sim.setMode(modes[(modes.indexOf(this.sim.mode) + 1) % modes.length]);
          changed = true;
          break;
        }
        default:
          break;
      }
    }

    if (this.replaying) {
      this.replayT += dt;
      if (this.replayT > this.recorder.duration) this.replayT = 0;
      this.recorder.sample(this.replayT, this.pose.position, this.pose.quaternion);
      if (changed) this.notify();
      return;
    }

    const sticks = this.input.sample(dt);
    const input = normalizeInput(sticks);
    if (!this.launched && input.throttle > 0.05) {
      this.launched = true;
      changed = true;
    }
    this.sim.setInput(input);
    this.sim.update(dt);
    this.sim.getRenderPose(this.pose.position, this.pose.quaternion);

    if (this.launched && !this.sim.paused) {
      if (this.sim.crashed) this.crashAt ??= this.sim.simTime;
      if (this.crashAt === null || this.sim.simTime - this.crashAt < 2) this.recorder.record(this.sim.simTime, this.pose.position, this.pose.quaternion);
    }
    // Flight-area limits: warn near the edge, end the flight after a grace period outside it.
    if (this.launched && !this.sim.paused && !this.sim.crashed) {
      const p = this.pose.position;
      const st = boundsState(p.x, p.z, this.sim.env.bounds);
      this.outTimer = st === "out" ? this.outTimer + Math.min(dt, 0.1) : 0;
      const left = Math.max(0, Math.ceil(BOUNDS_GRACE_S - this.outTimer));
      if (st !== this.boundsNow || (st === "out" && left !== this.secondsShown)) {
        this.boundsNow = st;
        this.secondsShown = st === "out" ? left : BOUNDS_GRACE_S;
        changed = true;
      }
      if (st === "out" && this.outTimer >= BOUNDS_GRACE_S) this.sim.forceCrash("Left the flight area");
    }
    const m = this.mission;
    if (m && this.launched) {
      m.start(this.sim.simTime);
      const p = this.pose.position;
      if (m.update(this.sim.simTime, [p.x, p.y, p.z], { crashed: this.sim.crashed, health: this.sim.health })) {
        changed = true;
        const r = m.result();
        if (r) this.onMissionEnd?.(r);
      }
    }
    if (changed) this.notify();
  }
}
