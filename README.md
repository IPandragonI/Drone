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
