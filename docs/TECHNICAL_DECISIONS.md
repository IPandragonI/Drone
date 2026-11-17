# Technical decisions

1. **Own Rapier integration, not `@react-three/rapier`.** The sim must run outside React with a fixed step and
   authoritative state; the wrapper ties physics to the React tree/frame loop.
2. **three.js math types inside `sim/`.** Vector3/Quaternion are used for convenience; no scene objects or React.
3. **Rapier body + custom forces.** Mass/inertia set explicitly via `setAdditionalMassProperties` (collider density 0).
   Gravity by Rapier; thrust, torque and drag by us each step (`resetForces` then `addForce`).
4. **Rate controller in acceleration units.** `τ = I∘Kp(ω_des−ω)`; retuning a drone is editing numbers in its config.
5. **Collision severity from contact Δv.** `Δv = v_post − v_pre − a_free·dt`, where `a_free` is thrust+drag+gravity.
   Avoids depending on Rapier contact-event API details; cooldown of 0.15 s per hit.
6. **Instanced environment.** One `InstancedMesh` per (shape, material).
7. **No post-processing in Phase 1.** AO/bloom deferred until profiled.

## Approximations and limitations (do not read as aerodynamic accuracy)
- Motor thrust is modelled as first-order lag on *thrust*, not on rotor speed with `T = kω²`. Rotor speed shown
  to the renderer/audio is `sqrt(T/Tmax)`.
- Linear + quadratic body-frame drag only; no rotor inflow, ground effect, translational lift, propwash, or blade flapping.
- No gyroscopic precession from rotors.
- Angle-mode attitude error uses `atan2` of the gravity vector in body frame (roll/pitch decoupled approximation;
  exact for single-axis tilt, slightly off in combined tilt).
- No altitude hold; throttle maps directly to collective thrust (hover throttle = 1/TWR).
- Battery: power ∝ thrust^k with voltage-sag scaling at low charge; not a cell model.
- Parameters are plausible estimates for each class, not measured from real hardware.
- The environment is a procedural blockout, not final art.

## Phase 2 validation results (closed-loop, full sim incl. motor lag and Rapier)
Measured in `src/sim/modes.test.ts` (asserted with margin):

| Drone | Angle full-stick target | Overshoot | Settle (+-1.5 deg) | Acro 50% roll rate (want / got) |
|---|---|---|---|---|
| FPV 5" | 55 deg | 0.9 deg | 0.39 s | 258 / 258 deg/s |
| Inspection | 30 deg | 3.7 deg (12%) | 0.62 s | n/a (no Acro) |
| Cinewhoop | 42 deg | 1.3 deg | 0.43 s | 163 / 161 deg/s |

Angle recovery to <2 deg after releasing full stick: 0.18 s (FPV), 0.34 s (Inspection), 0.20 s (Cinewhoop).
Horizon: full stick rolls past 90 deg for all drones; released at 120 deg it levels within 5 s.

## Known limitations found in Phase 2
- Horizon/Angle attitude error uses decoupled roll/pitch via `atan2` of the body-frame up vector. Near *exactly inverted*
  attitude both angles are ~+-180 deg and the correction is ambiguous; a stick released at ~180 deg is not reliably recovered.
  A proper fix is a vector/quaternion attitude error referenced to heading (planned with Phase 6 tuning).
- Gamepad throttle in `integrate` mode means releasing the stick holds throttle (like keyboard); `absolute` mode mimics a radio.
- Button mapping assumes the browser "standard" mapping; non-standard pads need axis/button remapping (axisMap exists, no UI).

## Phase 3 decisions (phone controller)
8. **Separate Node relay, not a Next route.** Route handlers cannot hold WebSockets. `server/relay.mjs` is plain Node + `ws`,
   testable in-process (`server/relay.test.ts`), started with `npm run relay`.
9. **Relay forwards, host validates.** The relay authenticates and rate-limits (240 msg/s, 512 B per frame) but never interprets sticks.
   `parsePadMessage` rejects non-finite/missing/oversized data and clamps ranges. Only whitelisted actions are accepted.
10. **Tokens.** 128-bit random pad and host tokens per session, 6-character code, TTL 10 min (sliding while the pad is active),
    constant-time compare. `POST /session` and the host role are limited to this machine's own addresses.
11. **Failsafe.** `RemoteInput` is stale after 300 ms without a frame (pad sends at 50 Hz, also as heartbeat) -> neutral sticks, throttle 0,
    control falls back to the keyboard. Same effect on disconnect. A frozen page is covered by an e2e check.
12. **Throttle hand-over.** Phone throttle is absolute (latched stick). On taking over from another device the carried-over throttle is
    held until the phone stick comes within 0.08 of it, so a device switch never drops or jumps throttle.
13. **Frames are idempotent snapshots, not deltas;** sequence numbers drop reordered frames; actions (reset, pause...) go over the reliable
    WebSocket, stick frames use the WebRTC channel when open (unordered, maxRetransmits 0) and fall back to the WebSocket.
14. **Floating relative sticks.** Touch-down point is the origin, so there is no jump when a thumb lands off-centre.

### Phone controller limits (read before trusting it)
- Tested only with an emulated phone (see ROADMAP). No physical-device latency numbers; the 3-8 ms RTT measured is loopback/LAN on one machine.
- `ws://` is unencrypted; anyone on the LAN who learns the URL/token within its lifetime can drive the drone. Acceptable for a local simulator, not for the internet.
- Wake Lock and orientation lock need HTTPS or fullscreen; on plain http the phone screen may sleep, which triggers the failsafe.
- WebRTC without STUN/TURN works only when both peers can reach each other's host candidates (typically same LAN; Chromium hides IPs
  behind mDNS names, which some networks block). Failure is silent and the WebSocket path continues.

## Phase 4-6 decisions
15. **Settings are validated data.** `mergeGameSettings` clamps every value and ignores wrong types, so a stale or hand-edited IndexedDB entry cannot break the sim.
16. **Audio is procedural and gesture-gated.** `AudioEngine` builds the graph on the first key/pointer event (browser autoplay rules); the HUD shows
    "Sound off: press any key" until then. Rotor pitch/loudness are pure functions (`audio/model.ts`), unit-tested for monotonicity and bounds.
17. **Mission clock = simulation time,** starting at first launch, so slow frames never change a result. Scoring is a pure function (`computeScore`).
18. **Missions are data, validated against geometry.** A test fails if a waypoint overlaps a collider or a straight leg between waypoints is blocked.
19. **Progress writes are serialised and delta-based.** One promise chain does read-modify-write; the flight view flushes only the change since the last
    flush (every 4 s, at mission end, on page hide), because async IndexedDB writes in `pagehide` are not guaranteed on a full navigation.
20. **Weather applies outdoors only.** Wind is a deterministic function of sim time (sum of sines), so a replay-free re-run sees the same gusts.
21. **Replay records poses, not inputs.** Cheap and exact for playback; it cannot be re-simulated or branched.
22. **`?debug=1` exposes `window.__session` / `window.__audio`** for end-to-end tests (teleport through waypoints, read audio state). It does nothing else.

### Limits of Phases 4-6 (read before trusting them)
- Wind is a simple force on the drag model, not turbulence, wake or building effects; gust strengths are plausible, not measured.
- Minimap draws footprints only (no heights); the yard map is auto-fitted, the hall uses a fixed window.
- Medal thresholds, par times and time limits are estimates. They were not tuned by playing.
- Audio level/pitch were checked through the audio graph, not by ear. Tune by listening.
- Replay is limited to 5 minutes and one flight; it is lost on reload.

## Visual upgrade decisions
23. **Drones are generated, not downloaded** (`render/droneModels.ts`). No redistributable model matching an FPV freestyle, an inspection quad and a cinewhoop was
    obtainable (see ASSETS.md), so the models are original code-built geometry: merged per material (a handful of draw calls), propellers as separate
    groups with twisted blades and a speed-driven blur disc. One builder serves the simulator, the showcase and the hero video. Motors sit exactly at the
    physics positions and the lens exactly at `camera.fpv.position` (unit-tested). The physics collider is unchanged.
24. **Triplanar world-space PBR** (`render/pbr.ts`). The environment is instanced, non-uniformly scaled boxes, so UV-mapped textures would stretch. Textures are
    projected in world metres, with large-scale colour variation and floor grime to hide repetition. Low graphics skips textures entirely.
25. **Sky is a shader dome** (`render/Atmosphere.tsx`): gradient, sun disc, fractal-noise clouds, haze to the fog colour. The same sky is rendered to a cube and
    prefiltered (PMREM) for image-based lighting, so reflections and ambient light match the sky. Presets are data (`skyPresets.ts`: clear, cloudy, overcast,
    golden hour, fog); a new time of day or weather is a new entry.
26. **Detail never changes the flyable space.** New geometry sits on walls, in the roof zone or on the floor; thin items are visual-only. The mission geometry
    tests (waypoints in free space, legs clear) still pass, which is the proof.
27. **The hero video is real simulated flight.** `sim/autopilot.ts` flies the FPV drone through the real physics along a route with 0.7 m clearance and zero
    collisions (asserted); the recorded poses are replayed in the production renderer (`/cinematic`) and captured frame by frame. It is a scripted autopilot
    flight, not a human pilot's.

### Limits of the visual upgrade
- Procedural models are detailed but are not scanned or artist-made assets; at close range in the showcase their simplicity shows.
- Textures are 1K JPEG, not GPU-compressed (KTX2). No LOD meshes (draw calls are already low through instancing and merging).
- Clouds are a 2D noise layer on the dome, not volumetric. There is no night preset yet.
- Frame rate was not measured (software rendering); performance claims are about draw-call and asset size, not fps.

## Map decisions (v1.2)
28. **Routes are data shared by map and mission.** Each new map exports its flight route; the map clears scatter (trees, boulders, dunes) around it, the mission uses it as
    waypoints. A reroute cannot desynchronise map and mission, and the geometry test fails if it ever does.
29. **Water is visual.** Surfaces use a transparent water material with `collide: false` over a colliding bed, so crashing into a river or the sea is a ground impact, not a swim.
30. **Flyability is proven, not assumed.** `environments.test.ts` checks every map for a free spawn and stable takeoff, and flies each new mission with the real autopilot.
31. **Limits:** flat ground (no terrain mesh), static turbine blades, ~2k instanced solids in the forest. Not measured on a GPU.

## v1.3 decisions
32. **Attitude error is a rotation vector** (`tiltError`): the rotation taking body "up" to the commanded "up", expressed in the body frame. It is single-valued through inverted flight (the exact-opposite case rolls about the nose axis),
    matches the old behaviour for single-axis tilts (all step-response tests unchanged) and is tested for recovery from 180 degrees in both axes for every drone and both self-levelling modes.
33. **Stale-link timeout adapts to the host.** `max(300 ms, 3 x host frame gap)`: a slow host no longer mistakes its own stalls for a lost phone, while a genuinely silent link is still cut.
34. **Colliders cover the prop span** (motor offset + prop radius). Mission routes are validated with a per-drone clearance (collider half-diagonal + margin).
35. **Flight area:** horizontal limits from `env.bounds` (14 m warning band, 6 s grace). Ending the flight reuses the crash path, so replay, stats and missions behave normally.
36. **Mission progression is data** (`requires`); difficulty only scales time (par and limit together), plus the collision thresholds already in the sim. Bests are keyed per difficulty (`id`, `id:easy`, `id:hard`).
37. **Debug hooks are build-time gated** (`NEXT_PUBLIC_ENABLE_DEBUG`), not URL-gated.
38. **Hosted relay mode** is opt-in (`RELAY_PUBLIC=1`): session cap, per-address creation rate limit, CORS origin check. TLS must be provided by the host. Untested on the public internet.
