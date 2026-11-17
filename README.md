# Drone Simulator

Browser-based quadcopter simulator (Next.js, React Three Fiber, Rapier). See `docs/` for architecture, roadmap and technical decisions.

```
npm install
npm run dev        # http://localhost:3000
npm test           # vitest (unit + integration)
npm run typecheck && npm run lint && npm run build
node scripts/smoke.mjs   # headless-browser smoke test against `next start -p 3100`
```

Keyboard (AZERTY labels): Up/Down throttle, Z/S pitch, Q/D roll, A/E yaw, X cut throttle, C camera, 1/2/3 Angle/Horizon/Acro, H HUD, V replay, M cycle mode, R reset, Space pause.

## Phone controller (Phase 3)

The phone becomes a wireless controller (two touch sticks, landscape). Next.js cannot host WebSockets, so a small relay
runs as a second process.

```bash
npm run build && npm run start:lan     # app, reachable from your LAN   (or: npm run dev:lan)
npm run relay                          # in a second terminal: relay on :3101
```

1. Open `http://localhost:3000/fly`, click **Phone** (top right). A QR code appears.
2. Scan it with a phone on the **same Wi-Fi**. Rotate to landscape.
3. Left stick: throttle (stays where you leave it) and yaw. Right stick: pitch and roll. Buttons: Reset (hold), Pause, Cam, Mode.

The link upgrades to a WebRTC data channel when it can; otherwise it stays on the WebSocket relay. The panel shows which.
If the phone goes silent for 300 ms (screen sleep, Wi-Fi drop) sticks go neutral and throttle drops to zero.

Security model: LAN only, unencrypted `ws://`, random 128-bit tokens valid for 10 minutes (sliding while in use), sessions can only
be created from the machine that runs the simulator. Do not expose ports 3000/3101 to the internet.
The Windows firewall may ask to allow Node on private networks; allow it for the phone to reach the app and relay.

## Missions, settings, weather, replay (Phases 4-6)

- **Missions** (`/missions`): Hall Slalom (course), Hall Inspection (hold 1.5 s at each point), Beacon Hunt (find five, any order), Yard Circuit (outdoor, breeze).
  The clock starts at take-off. Score = targets + time bonus + health bonus - impact penalties; gold/silver/bronze by percentage of the maximum.
  Best results, the last 50 attempts and flight statistics are stored locally (`/stats`).
- **Environments:** Industrial Complex (indoor) and Quarry Yard (outdoor, with calm/breeze/gusty wind). Both are procedural blockouts.
- **Settings** (`/settings`): controller, audio (master/motor/impact/mute), graphics default, camera (FPV FOV, vibration, chase distance),
  accessibility (HUD size, high contrast, reduced flashes, minimap).
- **Replay:** press **V** after flying (or after a crash/mission) for a chase-camera replay; V again exits, R restarts.
- **Sound** starts after your first key press (browser rule).

## Verification

```bash
npm run typecheck && npm run lint && npm test && npm run build
npx next start -p 3100 &              # then, in another shell:
node scripts/e2e-gamepad.mjs          # Phase 2: simulated gamepad (12 checks)
node scripts/e2e-phone.mjs            # Phase 3: emulated phone + relay + WebRTC (23 checks)
node scripts/e2e-final.mjs            # Phases 4-6: menus, settings, audio, minimap, missions, weather, replay (25 checks)
```
The e2e scripts run headless Chromium with software WebGL. They prove behaviour and wiring, not frame rate, feel, or sound quality.

## Visual upgrade (v1.1)

- **Landing page** (`/`): full-screen hero video (a real simulated flight, replayed in the production renderer), editorial sections for the simulator, drones,
  environments, controls and missions. The launcher moved to `/launch`.
- **Drone showcase** (`/drones`): an interactive 3D viewer per drone (drag, wheel, right-drag pan, reset), specs derived from the simulation config, and
  "Use this drone", which persists in IndexedDB and becomes the launcher default.
- **Drones:** detailed models with spinning, motion-blurred propellers, built from code (see `docs/ASSETS.md` for why they are not downloaded assets).
- **Environments:** triplanar PBR textures (ambientCG, CC0), much more architectural and service detail, industrial luminaires, floor wear.
- **Sky and lighting:** procedural sky with sun and clouds, image-based lighting from the sky, presets via `?sky=clear|cloudy|overcast|dusk|foggy`.
- **Graphics presets:** Low = flat materials, no clouds or IBL; Medium/High = textures, clouds, IBL, shadows.
- **Favicon:** original drone mark (`src/app/icon.svg`, `favicon.ico`, Apple touch icon, 192/512 px PNG, web manifest).

Regenerating assets: `node scripts/make-icons.mjs`; `GEN_HERO=1 npx vitest run src/sim/autopilot.test.ts` then
`node scripts/capture-hero.mjs` (about 30 min under software GL); `node scripts/capture-marketing.mjs`.
Visual verification: `node scripts/e2e-visual.mjs`.

## New logo and three more maps (v1.2)

- **Brand:** the logo comes from `new_logo.png`, traced to vector (`scripts/make-icons.mjs`). It produces the favicon set, Apple touch icon, PWA icons and the in-app logos
  (`public/brand/logo-white.svg`, `logo-amber.svg`), used in the landing nav and the launcher/showcase headers.
- **Pine Valley:** dense pine forest, river, timber bridge and cliffs. Mission: Pine Trail.
- **Desert Wind Farm:** dunes, a substation, a solar field and four 46 m turbines. Mission: Turbine Inspection (hold station at each nacelle).
- **Harbor District:** container stacks, a brick warehouse, quay cranes, a moored ship and open sea. Mission: Harbor Run.

Each map has its own default sky and works with the weather presets (`?env=pine-valley|desert-wind-farm|harbor-district&sky=...`).
Maps are procedural blockouts with a guaranteed-clear flight corridor; every mission route is checked against the geometry and flown by the autopilot in tests.

## v1.3: onboarding, controls, safety and progression

- **Training and unlocks:** two guided training missions (take-off/hover, three gates) unlock the hall missions; finishing Hall Slalom unlocks the outdoor missions.
  A "First time flying?" path on the launcher leads straight to Training. Settings → Gameplay can unlock everything.
- **Difficulty:** Easy (50% more time, forgiving impacts), Normal, Hard (20% less time, harsh impacts). Best scores are kept per difficulty.
- **Par times** come from autopilot reference flights through the real physics (par = 1.6x, limit = 4.5x of the reference); see `REFERENCE_FLIGHT_S`.
- **Controls:** the keyboard layout (AZERTY/QWERTY) is detected, every key can be rebound (Settings → Controls), and Settings → Tuning edits rates, expo,
  throttle curve and self-levelling per drone with live curves. Changes apply from the next flight.
- **In flight:** F1 shows all controls (with your real bindings), F3 shows fps/draw calls (and a "running slowly" hint appears by itself), Space/Esc opens a pause menu
  (Resume, Restart, Settings, Exit), crashes show their reason with a Restart button (optional auto-restart in Settings → Gameplay).
- **Flight area:** each map has limits. Near the edge you get a warning; outside it you have 6 seconds to return before the flight ends.
- **Physics:** Angle and Horizon now recover from any attitude, including exactly upside-down (tilt-vector attitude error). Colliders now cover the full prop span.
- **Debug hook:** `?debug=1` (teleport, `window.__session`) works only in development or in a build made with `NEXT_PUBLIC_ENABLE_DEBUG=1`. The e2e suites need such a build:
  `NEXT_PUBLIC_ENABLE_DEBUG=1 npm run build`. A normal production build ignores it (`node scripts/e2e-prod.mjs` checks this).

### Phone controller on a deployed site
The relay is a separate process (`npm run relay`) and cannot run on Vercel. For a hosted site, run the relay on a server with long-lived WebSockets behind TLS:
`RELAY_PUBLIC=1 RELAY_ORIGIN=https://your-site npm run relay`, then build the site with `NEXT_PUBLIC_RELAY_URL=https://relay.example.com`.
Public mode caps live sessions (200) and rate-limits session creation per address. Without a relay the Phone panel explains that it is unavailable
(it works when you run the simulator on your own computer). The hosted mode is implemented and unit-tested but has not been deployed or tested over the internet.
