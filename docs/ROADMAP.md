# Roadmap

Status legend: [x] done, [~] partial / approximation, [ ] not started.

## Phase 0 — Architecture
- [x] Repository inspected (empty), docs written, stack installed.

## Phase 1 — Simulation prototype
- [x] Next.js foundation, strict TS, Vitest
- [x] Dedicated sim core (fixed 120 Hz, interpolation), 4 motors, mixer, Rapier collisions
- [x] Procedural industrial blockout (hall, workshop, storage, mezzanine, stairs, catwalks, pipes, machinery)
- [x] FPV + chase camera, keyboard, crash/reset, minimal HUD
- [x] Flight modes implemented in the core (validated in Phase 2)
- Acceptance: take off, fly, collide, crash, reset – see Phase 1 report for what was actually tested.

## Phase 2 — Advanced controls (done)
- [x] Gamepad API source: Mode 1/2, axis map, per-axis deadzone/expo/sensitivity/invert, throttle integrate/absolute, button edges
- [x] Calibration (centre + per-half-axis range) with wizard UI, validation of stored settings
- [x] Settings persisted in IndexedDB (`storage/kv.ts`); `/settings` controller screen with live axes
- [x] InputManager: active-device switching with throttle hand-over; pad loss => neutral sticks, throttle cut
- [x] Flight-mode validation tests with measured step responses (see TECHNICAL_DECISIONS)
- [~] Gamepad verified in a real browser only with a *simulated* pad (Chromium + injected `getGamepads`); not yet with physical Xbox/PlayStation hardware
- [ ] Keyboard rebinding UI, drone-physics tuning UI (config files are editable; no UI yet)

## Phase 3 — Smartphone controller (implemented; real-phone test pending)
- [x] Relay process (`server/relay.mjs`, `npm run relay`): session creation (local machine only), 128-bit tokens with TTL, host/pad roles, forwarding, rate limit, reconnect (newer pad replaces older)
- [x] Protocol with strict validation/clamping (`src/net/protocol.ts`); host never trusts the phone
- [x] `RemoteInput` + `InputManager`: phone is a third device, throttle hand-over without jumps, stale (300 ms) failsafe
- [x] QR pairing panel on the flight screen; `/pad` landscape UI with multitouch pointer-event sticks, latched throttle, hold-to-reset
- [x] Automatic reconnect with backoff; expired/wrong token shows a final "Link expired" screen
- [x] WebRTC DataChannel (unordered, no retransmit) negotiated over the relay, automatic fallback to WebSocket
- [~] Verified with an *emulated* phone (Chromium touch events via CDP, separate browser context, real WebSocket/WebRTC on this machine): 23/23 checks in `scripts/e2e-phone.mjs`. **Not yet tried on a physical phone** (Wi-Fi latency, firewall, iOS/Android browser quirks, screen-sleep behaviour)
- [ ] WebRTC across different networks (needs STUN/TURN via `NEXT_PUBLIC_ICE_SERVERS` and a publicly reachable relay; untested and out of the LAN security model)
- [ ] HTTPS for the pad (needed for Wake Lock and some fullscreen/orientation APIs on phones)

## Phase 4 - Full UX (implemented)
- [x] Menu: environment, weather (outdoor only), drone, flight mode, graphics; links to Missions, Stats, Settings
- [x] Settings hub with tabs (Controls, Audio, Graphics, Camera, Accessibility), auto-saved to IndexedDB, validated on load (`config/gameSettings.ts`)
- [x] Web Audio engine: four detuned rotors + prop-wash noise follow rotor speed; impact sounds by severity; master/motor/impact volume, mute
- [x] HUD: minimap (structures, drone heading, mission targets), HUD scale, high-contrast mode, reduced flashes
- [x] Camera settings: FPV field of view, vibration, chase distance
- [~] Audio is synthesised placeholder sound, not recorded samples; no spatial audio. Verified: graph state/gains/pitch via a debug hook, **not** by listening
- [ ] Keyboard rebinding UI, drone physics tuning UI, pause menu with resume/exit buttons

## Phase 5 - Missions (implemented)
- [x] Data-driven missions (`missions/defs.ts`): ordered course, inspection with dwell time, unordered exploration, outdoor circuit with wind
- [x] `MissionRunner`: clock starts at launch, sim-time based, scoring (targets, time bonus, health bonus, impact penalty), medals, crash/time-out failure
- [x] 3D markers (billboard rings), mission HUD, briefing and result screens, retry (R)
- [x] Progress in IndexedDB: best score/medal per mission, last 50 attempts, flight statistics; Stats page with clear-progress
- [x] Static validation that every waypoint is in free space and every straight leg is clear (`missions/validate.ts`)
- [~] Missions were verified by teleporting the drone through the waypoints (real tick, scoring, saving); **no automated or human play-through has flown them** - difficulty, par times and medal thresholds are untuned guesses
- [ ] Training/tutorial missions, leaderboards, mission editor

## Phase 6 - Enrichment (partly implemented)
- [x] Second environment: Quarry Yard (outdoor blockout) with gantry, tanks, containers, tower
- [x] Weather: calm / breeze / gusty wind (deterministic sine-sum gusts) in outdoor maps; indoor maps stay calm
- [x] Replay: pose recorder (30 Hz, 5 min cap), chase-camera playback with V
- [ ] More drones (still 3), GLB/asset pipeline (environments and drones are procedural primitives), mission/map editor, ghost replays, spatial audio

## Technical risks
| Risk | Mitigation |
|---|---|
| Control loop instability at 120 Hz with motor lag | Gains in 1/s, tested in unit tests; tune per drone config |
| Rapier contact noise causing false collision events | Δv minus expected free acceleration, thresholds, cooldown |
| Tunnelling at 30+ m/s | CCD on drone body, 120 Hz step |
| Rapier WASM in Next/webpack | `-compat` build embeds wasm; client-only dynamic import |
| WebSocket hosting in Next | Separate Node process in Phase 3 |
| Placeholder visuals mistaken for finished art | Documented as blockout; GLB-ready data model |
| Draw calls | Environment instanced per (shape, material) |

## Visual upgrade (done, with honest limits)
- [x] Favicon set (SVG, ICO, PNG, Apple touch icon, manifest)
- [x] Three detailed drone models wired to the sim (props at motor positions, spin by rotor speed, lens at the FPV camera position)
- [~] Models are original procedural geometry, not downloaded/artist-made assets: no suitable licensed models were obtainable (docs/ASSETS.md)
- [x] Drone showcase page with interactive viewers, real specs and a persisted selection
- [x] Landing page redesign with a hero video captured from the simulator, reduced-motion and poster fallbacks
- [x] PBR textures (CC0), detailed industrial hall and yard, collision-safe (mission geometry tests pass)
- [x] Procedural sky with clouds, sun, haze, fog, image-based lighting; presets for clear / cloudy / overcast / golden hour / fog
- [~] Not done: GLB assets and KTX2 texture compression, LOD meshes, volumetric clouds, night, real-device and real-GPU frame-rate measurement

## Brand and maps (v1.2, done)
- [x] Logo from `new_logo.png` traced to vector; favicon, Apple/PWA icons and in-app logos regenerated
- [x] Three new maps (forest, desert wind farm, harbor) with three new missions; registry-driven menus and default skies
- [~] Maps are procedural blockouts (trees are stacked cylinders, turbines are boxes and cylinders); no terrain heightmap, no moving water or turbine rotation

## v1.3 prioritised fixes (done)
- [x] P0: debug hook gated; phone relay configurable/hostable with an honest "unavailable" state; flight-area limits; first-run guidance and Angle default; F3 performance overlay + slow-machine hint
- [~] P0: GPU frame rates are still unmeasured (software rendering only): use F3 on real hardware. Flight feel still needs real pilots: the Tuning screen exists so they can adjust it
- [x] P1: keyboard layout detection + rebinding; rates/expo/levelling tuning UI; inverted-attitude recovery; collider covers props; crash reasons, restart button, optional auto-restart; pause menu;
      HUD legibility/overlap; training, unlocks, difficulty tiers; par times anchored to reference flights
- [ ] Not done by request: CI. Not done: human-validated mission balance, tuning presets, ghost/leaderboards
