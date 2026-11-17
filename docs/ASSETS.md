# Assets, sources and licences

Everything shipped in this repository is either **original work** or **CC0**. Nothing requires attribution, but the sources are
recorded here so the claim can be checked.

## Drone models: original, generated from code
`src/render/droneModels.ts` builds the three drones (FPV Freestyle 5", Inspection Quad, Cinewhoop 3") procedurally: carbon plates,
standoffs, motors, twisted propeller blades, ducts, gimbal, antennas, LEDs. They are **not downloaded models**.

I looked for real, redistributable models first and found none usable:
| Source | Finding |
|---|---|
| Poly Haven | CC0, but the catalogue (522 models) contains no drones. |
| Sketchfab | CC0 + downloadable search returned nothing for FPV/inspection/cinewhoop drones; downloads also require an authenticated API token. |
| Poly Pizza | Has drone models, but they are generic low-poly "Drone / Bot Drone / Predator Drone" styles (not a freestyle FPV, inspection quad or cinewhoop), licensed **CC-BY** (attribution required), and direct downloads are blocked (HTTP 403). |
| Meshy | AI generation service, requires an account and credits; output licence depends on plan. Not used. |

If you obtain a licensed GLB later, the swap point is `buildDroneModel()`: keep the contract (4 prop groups at the motor positions,
lens at `drone.camera.fpv.position`) and `droneModels.test.ts` will verify it.

## Textures: ambientCG (CC0 1.0)
Downloaded from https://ambientcg.com (licence: https://docs.ambientcg.com/license/ , CC0 1.0 Universal, free for commercial use, no attribution required).
Colour, normal (OpenGL) and roughness maps, resized to 1024 px (wood 512 px) and re-encoded as JPEG with `scripts/prepare-textures.mjs`
(about 1.5 MB in total).

| Local folder | ambientCG asset | Used for |
|---|---|---|
| `public/textures/concrete` | Concrete034 | walls, floors, barriers |
| `public/textures/metal` | Metal049A | structural steel, painted steel detail |
| `public/textures/corrugated` | CorrugatedSteel009 | ducts, sheds |
| `public/textures/wood` | Wood095 | pallets |
| `public/textures/ground` | Ground111 | quarry ground |
| `public/textures/walkway` | MetalWalkway014 | gratings, stairs |

## Sky, clouds, lighting, icons
Procedural (shader and code): `src/render/Atmosphere.tsx`, `skyPresets.ts`. No HDRI or sky textures are downloaded; image-based lighting is
rendered from the procedural sky itself. The showcase viewer uses three.js's built-in `RoomEnvironment`.
The favicon (`src/app/icon.svg`, generated set via `scripts/make-icons.mjs`) is an original drawing.

## Hero video and screenshots
Captured from this simulator: `src/sim/autopilot.ts` flies the real physics through a validated route (`autopilot.test.ts` records it), `scripts/capture-hero.mjs` renders
the recording frame by frame, `scripts/capture-marketing.mjs` takes the landing-page images. No stock footage.

## Tools (development only)
`ffmpeg-static` (GPL-licensed ffmpeg binary, used only to encode the video offline, not shipped), `sharp` (image resizing).

## Additional textures for the new maps (ambientCG, CC0 1.0)
| Local folder | ambientCG asset | Used for |
|---|---|---|
| `public/textures/grass` | Grass004 | forest floor, meadows |
| `public/textures/rock` | Rock063 | cliffs, boulders |
| `public/textures/sand` | Ground054 | desert |
| `public/textures/asphalt` | Asphalt033 | harbour quay and roads |
| `public/textures/brick` | Bricks105 | warehouse walls |

## Logo
`new_logo.png` (supplied by the project owner) is traced to vector with potrace by `scripts/make-icons.mjs`, which produces the favicon set,
Apple touch icon, PWA icons and the in-app logos in `public/brand/`.
