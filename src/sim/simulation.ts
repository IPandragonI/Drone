import { Quaternion, Vector3 } from "three";
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import type { DroneConfig } from "@/config/drones/types";
import {
  COLLISION_COOLDOWN_S,
  DAMAGE_BY_SEVERITY,
  GRAVITY,
  MAX_SUBSTEPS,
  MOTOR_IDLE_FRACTION,
  PHYSICS_DT,
  type CollisionDifficulty,
} from "@/config/sim";
import type { EnvironmentDef } from "@/env/types";
import { classifyCollision } from "./collision";
import { createControllerOutput, runFlightController } from "./flight/controller";
import { MOTOR_X_SIGN, MOTOR_Z_SIGN, mix, mixForward, mixerGeometry, type MixerGeometry } from "./flight/mixer";
import { seededRandom } from "@/env/builder";
import { NEUTRAL_INPUT, type CollisionEvent, type DroneInput, type FlightMode, type SimStatus, type Telemetry } from "./types";
import { createWorld, initRapier, RAPIER } from "./world";
import { WEATHER_PRESETS, WindModel, type WeatherPreset } from "./wind";

const DEG = Math.PI / 180;

export interface SimulationOptions {
  env: EnvironmentDef;
  drone: DroneConfig;
  mode?: FlightMode;
  difficulty?: CollisionDifficulty;
  seed?: number;
}

export interface SimEvents {
  collision: CollisionEvent;
  crash: CollisionEvent | { severity: "critical"; reason: string };
  reset: undefined;
  status: SimStatus;
}

type Listener<K extends keyof SimEvents> = (payload: SimEvents[K]) => void;

/**
 * Framework-free simulation of one quadcopter in one environment.
 * Fixed 120 Hz steps; the renderer reads an interpolated pose.
 */
export class Simulation {
  readonly drone: DroneConfig;
  readonly env: EnvironmentDef;
  mode: FlightMode;
  difficulty: CollisionDifficulty;

  /** Constant wind velocity in world frame, m/s. */
  wind = new Vector3();
  /** Optional time-varying wind; when set it overwrites `wind` every physics step. */
  windModel: WindModel | null = null;

  setWeather(preset: WeatherPreset): void {
    this.windModel = preset === "calm" ? null : new WindModel(WEATHER_PRESETS[preset]);
    if (!this.windModel) this.wind.set(0, 0, 0);
  }

  /** End the flight with a reason (e.g. the pilot left the flight area). */
  forceCrash(reason: string): void {
    if (!this.crashed) this.setCrashed({ severity: "critical", reason });
  }

  /** Move the drone (velocities zeroed). Used by the debug hook and tests only. */
  debugTeleport(x: number, y: number, z: number): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.velPrev.set(0, 0, 0); // otherwise the sudden stop would be classified as an impact
    this.snapshot();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  // Public live state (read by HUD/audio/camera; do not mutate externally).
  health = 1;
  battery = 1;
  flightTime = 0;
  simTime = 0;
  crashed = false;
  paused = false;
  /** Current motor thrusts, N. */
  readonly motorThrust = new Float64Array(4);
  /** Per-motor efficiency (1 = healthy). */
  readonly motorEfficiency = new Float64Array([1, 1, 1, 1]);

  private world: RAPIER_NS.World;
  private body: RAPIER_NS.RigidBody;
  private geo: MixerGeometry;
  private input: DroneInput = { ...NEUTRAL_INPUT };
  private accumulator = 0;
  private spawnPos: Vector3;
  private spawnYaw: number;
  private lastImpactTime = -10;
  private hasLaunched = false;
  private rng: () => number;
  private seed: number;
  private disturbance = new Vector3(); // body-frame angular acceleration, rad/s^2, decays
  private listeners = new Map<keyof SimEvents, Set<(payload: never) => void>>();

  // interpolation
  private prevPos = new Vector3();
  private currPos = new Vector3();
  private prevQuat = new Quaternion();
  private currQuat = new Quaternion();
  private alpha = 1;

  // scratch (avoid per-step allocation)
  private q = new Quaternion();
  private qInv = new Quaternion();
  private bodyRates = new Vector3();
  private vel = new Vector3();
  private velPrev = new Vector3();
  private ctrl = createControllerOutput();
  private targets = new Float64Array(4);
  private vTmp = new Vector3();
  private fTmp = new Vector3();
  private tTmp = new Vector3();

  private constructor(opts: SimulationOptions, world: RAPIER_NS.World, body: RAPIER_NS.RigidBody) {
    this.env = opts.env;
    this.drone = opts.drone;
    this.mode = opts.mode ?? opts.drone.defaultMode;
    this.difficulty = opts.difficulty ?? "normal";
    this.world = world;
    this.body = body;
    this.geo = mixerGeometry(opts.drone.physics.armLengthM, opts.drone.physics.yawTorqueRatio);
    this.seed = opts.seed ?? 1337;
    this.rng = seededRandom(this.seed);
    // env.spawn.position is a FLOOR point: rest the collider on it so a (re)spawn never drops onto the ground.
    this.spawnPos = new Vector3(...opts.env.spawn.position);
    this.spawnPos.y += opts.drone.physics.colliderHalfExtents[1] + 0.003;
    this.spawnYaw = opts.env.spawn.yawDeg * DEG;
    this.snapshot();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  static async create(opts: SimulationOptions): Promise<Simulation> {
    await initRapier();
    const { world } = createWorld(opts.env);
    const p = opts.drone.physics;
    const yaw = opts.env.spawn.yawDeg * DEG;
    const sp = opts.env.spawn.position;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(sp[0], sp[1] + p.colliderHalfExtents[1] + 0.003, sp[2])
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setAdditionalMassProperties(
        p.massKg,
        { x: 0, y: 0, z: 0 },
        { x: p.inertia[0], y: p.inertia[1], z: p.inertia[2] },
        { x: 0, y: 0, z: 0, w: 1 },
      );
    const body = world.createRigidBody(desc);
    // Single compound-free collider: no self collisions possible. Density 0: mass comes from the body properties.
    const h = p.colliderHalfExtents;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(h[0], h[1], h[2]).setDensity(0).setFriction(p.friction).setRestitution(p.restitution),
      body,
    );
    return new Simulation(opts, world, body);
  }

  on<K extends keyof SimEvents>(event: K, cb: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as (payload: never) => void);
    return () => {
      set.delete(cb as (payload: never) => void);
    };
  }

  private emit<K extends keyof SimEvents>(event: K, payload: SimEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => (cb as Listener<K>)(payload));
  }

  get status(): SimStatus {
    return this.crashed ? "crashed" : this.paused ? "paused" : "flying";
  }

  setInput(input: DroneInput): void {
    this.input = input;
  }

  setMode(mode: FlightMode): void {
    if (this.drone.flightModes.includes(mode)) this.mode = mode;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.emit("status", this.status);
  }

  setSpawn(position: Vector3, yawRad: number): void {
    this.spawnPos.copy(position);
    this.spawnYaw = yawRad;
  }

  /** Restart at the last valid spawn point with a fresh drone. */
  reset(): void {
    const b = this.body;
    b.setTranslation({ x: this.spawnPos.x, y: this.spawnPos.y, z: this.spawnPos.z }, true);
    b.setRotation({ x: 0, y: Math.sin(this.spawnYaw / 2), z: 0, w: Math.cos(this.spawnYaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.resetForces(true);
    b.resetTorques(true);
    this.motorThrust.fill(0);
    this.motorEfficiency.fill(1);
    this.disturbance.set(0, 0, 0);
    this.health = 1;
    this.battery = 1;
    this.flightTime = 0;
    this.hasLaunched = false;
    this.crashed = false;
    this.paused = false;
    this.accumulator = 0;
    this.lastImpactTime = this.simTime;
    this.input = { ...NEUTRAL_INPUT };
    this.snapshot();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.alpha = 1;
    this.emit("reset", undefined);
    this.emit("status", this.status);
  }

  /** Advance the simulation by a rendered-frame delta (seconds). */
  update(frameDt: number): void {
    if (this.paused) return;
    this.accumulator += Math.min(Math.max(frameDt, 0), 0.1);
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < MAX_SUBSTEPS) {
      this.step(PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0; // drop backlog on very slow frames
    this.alpha = this.accumulator / PHYSICS_DT;
  }

  /** Run exactly one fixed step (used by tests and the main loop). */
  step(dt: number = PHYSICS_DT): void {
    const p = this.drone.physics;
    const b = this.body;

    this.snapshot();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    if (this.windModel) this.windModel.sample(this.simTime, this.wind);

    const r = b.rotation();
    const lv = b.linvel();
    const av = b.angvel();
    this.q.set(r.x, r.y, r.z, r.w);
    this.qInv.copy(this.q).invert();
    this.velPrev.set(lv.x, lv.y, lv.z);
    this.bodyRates.set(av.x, av.y, av.z).applyQuaternion(this.qInv);

    // --- battery sag limits available thrust
    const sag = this.batteryScale();
    const maxPer = p.maxThrustPerMotorN * sag;

    // --- flight controller + mixer -> motor targets
    if (!this.crashed) {
      runFlightController(this.input, this.mode, this.q, this.bodyRates, p, maxPer * 4, this.ctrl);
      mix(this.ctrl.collective, this.ctrl.torque.x, this.ctrl.torque.y, this.ctrl.torque.z, this.geo, maxPer, this.targets);
      const idle = MOTOR_IDLE_FRACTION * maxPer;
      for (let i = 0; i < 4; i++) if (this.targets[i] < idle) this.targets[i] = idle;
      if (!this.hasLaunched && this.input.throttle > 0.05) this.hasLaunched = true;
    } else {
      this.targets.fill(0);
    }

    // --- motors: first-order lag, efficiency from damage
    const alpha = 1 - Math.exp(-dt / p.motorTimeConstantS);
    for (let i = 0; i < 4; i++) {
      const target = this.targets[i] * this.motorEfficiency[i];
      this.motorThrust[i] += (target - this.motorThrust[i]) * alpha;
    }
    const fw = mixForward(this.motorThrust, this.geo);

    // --- forces: thrust along body up, drag in body frame relative to air
    this.fTmp.set(0, fw.thrust, 0);
    this.vTmp.set(lv.x - this.wind.x, lv.y - this.wind.y, lv.z - this.wind.z).applyQuaternion(this.qInv);
    const vx = this.vTmp.x;
    const vy = this.vTmp.y;
    const vz = this.vTmp.z;
    this.fTmp.x -= p.dragLinear[0] * vx + p.dragQuadratic[0] * Math.abs(vx) * vx;
    this.fTmp.y -= p.dragLinear[1] * vy + p.dragQuadratic[1] * Math.abs(vy) * vy;
    this.fTmp.z -= p.dragLinear[2] * vz + p.dragQuadratic[2] * Math.abs(vz) * vz;
    this.fTmp.applyQuaternion(this.q); // -> world

    // --- torques (body frame -> world)
    this.tTmp.set(
      fw.tauX - p.angularDrag * this.bodyRates.x + this.disturbance.x * p.inertia[0],
      fw.tauY - p.angularDrag * this.bodyRates.y + this.disturbance.y * p.inertia[1],
      fw.tauZ - p.angularDrag * this.bodyRates.z + this.disturbance.z * p.inertia[2],
    );
    this.tTmp.applyQuaternion(this.q);
    this.disturbance.multiplyScalar(Math.exp(-dt / 0.35));

    b.resetForces(false);
    b.resetTorques(false);
    b.addForce({ x: this.fTmp.x, y: this.fTmp.y, z: this.fTmp.z }, true);
    b.addTorque({ x: this.tTmp.x, y: this.tTmp.y, z: this.tTmp.z }, true);

    // --- integrate
    this.world.step();
    this.simTime += dt;

    // --- impact detection: contact dv = measured dv - dv expected from free acceleration
    const lv2 = b.linvel();
    this.vel.set(lv2.x, lv2.y, lv2.z);
    const m = p.massKg;
    const dvx = this.vel.x - this.velPrev.x - (this.fTmp.x / m) * dt;
    const dvy = this.vel.y - this.velPrev.y - (this.fTmp.y / m - GRAVITY) * dt;
    const dvz = this.vel.z - this.velPrev.z - (this.fTmp.z / m) * dt;
    const impact = Math.hypot(dvx, dvy, dvz);
    if (!this.crashed && this.simTime - this.lastImpactTime > COLLISION_COOLDOWN_S) {
      const severity = classifyCollision(impact, this.difficulty);
      if (severity !== "none") {
        this.lastImpactTime = this.simTime;
        this.applyImpact(severity, impact, dvx, dvy, dvz);
      }
    }

    // --- battery + flight time
    if (!this.crashed) {
      const maxTotal = p.maxThrustPerMotorN * 4;
      const frac = Math.min(1, fw.thrust / maxTotal);
      const bat = this.drone.battery;
      const power = bat.idlePowerW + (bat.maxPowerW - bat.idlePowerW) * Math.pow(frac, bat.powerExponent);
      this.battery = Math.max(0, this.battery - (power * dt) / (3600 * bat.capacityWh));
      if (this.hasLaunched) this.flightTime += dt;
    }

    // out-of-world guard
    const y = b.translation().y;
    if (!this.crashed && y < this.env.bounds.min[1] - 30) {
      this.setCrashed({ severity: "critical", reason: "out-of-bounds" });
    }
  }

  private batteryScale(): number {
    if (this.battery <= 0) return 0;
    return this.battery > 0.2 ? 1 : 0.55 + (0.45 * this.battery) / 0.2;
  }

  private applyImpact(severity: Exclude<CollisionEvent["severity"], "none">, impact: number, dvx: number, dvy: number, dvz: number): void {
    const dmg = DAMAGE_BY_SEVERITY[severity];
    this.health = Math.max(0, this.health - dmg.health);
    const pos = this.body.translation();
    const event: CollisionEvent = { severity, impactSpeed: impact, position: [pos.x, pos.y, pos.z], time: this.simTime };

    if (dmg.motorLoss > 0 && severity !== "critical") {
      // Find the motor closest to the contact side: the wall lies opposite to the velocity change.
      this.vTmp.set(-dvx, -dvy, -dvz).applyQuaternion(this.qInv);
      let best = 0;
      let bestDot = -Infinity;
      for (let i = 0; i < 4; i++) {
        const d = MOTOR_X_SIGN[i] * this.vTmp.x + MOTOR_Z_SIGN[i] * this.vTmp.z;
        if (d > bestDot) {
          bestDot = d;
          best = i;
        }
      }
      this.motorEfficiency[best] *= 1 - dmg.motorLoss * (0.5 + 0.5 * this.rng());
    }
    if (dmg.disturbance > 0) {
      const s = dmg.disturbance;
      this.disturbance.add(new Vector3((this.rng() - 0.5) * 2 * s, (this.rng() - 0.5) * s, (this.rng() - 0.5) * 2 * s));
    }
    this.emit("collision", event);
    if (severity === "critical" || this.health <= 0) this.setCrashed(event);
  }

  private setCrashed(e: SimEvents["crash"]): void {
    if (this.crashed) return;
    this.crashed = true;
    this.emit("crash", e);
    this.emit("status", this.status);
  }

  private snapshot(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  /** Interpolated pose between the last two physics states. */
  getRenderPose(outPos: Vector3, outQuat: Quaternion): void {
    this.snapshot();
    // After a step, prev holds the state before it; curr is the latest. Blend by remaining accumulator.
    outPos.lerpVectors(this.prevPos, this.currPos, this.alpha);
    outQuat.slerpQuaternions(this.prevQuat, this.currQuat, this.alpha);
  }

  getTelemetry(out?: Telemetry): Telemetry {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    this.q.set(r.x, r.y, r.z, r.w);
    this.vTmp.set(0, 0, -1).applyQuaternion(this.q);
    let heading = Math.atan2(this.vTmp.x, -this.vTmp.z) / DEG;
    if (heading < 0) heading += 360;
    this.fTmp.set(0, 1, 0).applyQuaternion(this.q);
    const tilt = Math.acos(Math.min(1, Math.max(-1, this.fTmp.y))) / DEG;
    const maxT = this.drone.physics.maxThrustPerMotorN;
    const tel: Telemetry = out ?? {
      speedH: 0, speedV: 0, altitude: 0, heading: 0, battery: 1, health: 1, flightTime: 0, tiltDeg: 0,
      motors: [0, 0, 0, 0], position: [0, 0, 0],
    };
    tel.speedH = Math.hypot(v.x, v.z);
    tel.speedV = v.y;
    tel.altitude = t.y;
    tel.heading = heading;
    tel.battery = this.battery;
    tel.health = this.health;
    tel.flightTime = this.flightTime;
    tel.tiltDeg = tilt;
    for (let i = 0; i < 4; i++) tel.motors[i] = Math.sqrt(Math.max(0, this.motorThrust[i]) / maxT);
    tel.position[0] = t.x;
    tel.position[1] = t.y;
    tel.position[2] = t.z;
    return tel;
  }

  /** Test helper: current raw body state. */
  getBody(): RAPIER_NS.RigidBody {
    return this.body;
  }

  dispose(): void {
    this.world.free();
  }
}
