# Architecture

Greenfield repository (empty at start of Phase 0). Stack: Next.js 16 (App Router), React 19, TypeScript strict,
Three.js + React Three Fiber, Rapier (`@dimforge/rapier3d-compat`), Tailwind 4, Vitest.

## Guiding rule

**The simulation is plain TypeScript and knows nothing about React.** React/R3F only *reads* simulation state
inside `useFrame` / timers via refs. No per-frame React state.

```
 input sources ──► InputManager ──► DroneInput ──┐
 (keyboard, gamepad, phone)                      ▼
                                   ┌──────────────────────────┐
  EnvironmentDef (data) ─────────► │ Simulation (fixed 120 Hz)│
  DroneConfig   (data) ──────────► │  FlightController        │
                                   │  Mixer + Motors          │
                                   │  Rapier world / body     │
                                   │  Collision + Damage      │
                                   └───────────┬──────────────┘
                                               │ interpolated pose, telemetry, events
                             ┌─────────────────┴───────────────┐
                             ▼                                 ▼
                    R3F renderer (scene, camera rig)     HUD / overlays (DOM, refs)
```

## Folder structure

```
docs/                      ARCHITECTURE, ROADMAP, TECHNICAL_DECISIONS
src/
  app/                     Next routes (/, /fly) - thin; no simulation logic
  config/                  centralised constants: sim.ts, controls.ts, graphics.ts, drones/*.ts
  sim/                     framework-free simulation core (unit-tested)
    types.ts               DroneInput, FlightMode, Telemetry ...
    input/                 normalize.ts, keyboard.ts, manager.ts   (gamepad, touch/remote in Phase 2/3)
    flight/                controller.ts (modes), mixer.ts, motors.ts
    collision.ts           severity classification
    world.ts               Rapier world + static colliders from EnvironmentDef
    simulation.ts          fixed-step loop, interpolation, damage, battery, reset
  env/                     EnvironmentDef types, builder helpers, industrial.ts (procedural blockout)
  render/                  R3F only: FlightScene, EnvironmentRenderer, DroneModel, CameraRig, materials
  ui/                      DOM components: HUD, overlays, menu pieces
  services/                (Phase 3) session / signaling / WebSocket / WebRTC
  audio/                   (Phase 4) Web Audio engine
  storage/                 (Phase 4/5) IndexedDB
```

## Key design points

- **Data-driven**: drones (`DroneConfig`), environments (`EnvironmentDef`), later missions are plain data.
  A new drone or map requires no engine change.
- **Own flight dynamics, Rapier for contacts**: Rapier owns the rigid body (integration, collisions, CCD).
  Each 120 Hz step we compute four motor thrusts and apply the resulting force/torque + drag with
  `addForce/addTorque`. No kinematic "move toward input" controller.
- **Visual vs collision geometry**: each `Solid` has independent `visible` / `collide` flags, so a detailed
  visual can be paired with a simple invisible collider. GLB replacement later = add `assets` to the
  environment def; the loader interface stays the same.
- **Fixed timestep + interpolation**: accumulator at 120 Hz (max 10 substeps/frame); renderer interpolates
  between previous and current pose.
- **Input**: every device produces the same normalised `DroneInput`. Sources are polled once per render frame;
  the sampled value is held across physics substeps.

## Coordinate conventions

Right-handed, Y up (three.js). Drone body: +X right, +Y up, forward = **-Z**.
Body rates: w.x = pitch (positive = nose up), w.y = yaw (positive = nose left), w.z = roll (positive = roll left).
Stick signs: positive pitch = nose down/forward, positive roll = right, positive yaw = right.

## Flight model summary (see TECHNICAL_DECISIONS for limits)

1. Flight controller: stick -> desired body rates (Acro) / desired attitude -> rates (Angle) / blend (Horizon).
2. Rate loop: `tau = I o Kp (w_des - w)` (gains in 1/s, independent of airframe inertia).
3. Mixer (X quad): collective + 3 torques -> 4 motor thrust targets, with airmode-style desaturation.
4. Motors: first-order lag, damage efficiency, battery sag; thrust, reaction yaw torque and roll/pitch torque from arm geometry.
5. Drag: body-frame linear + quadratic, relative to wind.
6. Rapier integrates; contact dv (minus expected free acceleration) classifies collision severity.

## Modules added in Phases 3-6
```
server/relay.mjs          LAN relay (sessions, tokens, WebSocket forwarding, signalling)       [Phase 3]
src/net/                  protocol (validation), hostLink/padLink (WebSocket + WebRTC)         [Phase 3]
src/sim/input/remote.ts   phone as an input device (stale failsafe, throttle hand-over)        [Phase 3]
src/audio/                procedural Web Audio engine + pure sound model                       [Phase 4]
src/config/gameSettings   audio/graphics/camera/accessibility settings (validated)            [Phase 4]
src/ui/Minimap, SettingsTabs                                                                   [Phase 4]
src/missions/             defs (data), runner (state machine + scoring), validate, progress    [Phase 5]
src/storage/progress      serialised IndexedDB read-modify-write                               [Phase 5]
src/env/registry, yard    environment registry and the Quarry Yard                             [Phase 6]
src/sim/wind, replay      weather model, pose recorder/playback                                [Phase 6]
```
FlightSession remains the single glue object: it owns input devices, the optional MissionRunner, the recorder and replay state;
React only subscribes to its coarse `ViewState`. Per-frame values (HUD, minimap, markers, audio) never go through React state.
