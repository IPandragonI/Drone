"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ACESFilmicToneMapping, PCFSoftShadowMap } from "three";
import { GRAPHICS_PRESETS, type GraphicsQuality } from "@/config/graphics";
import type { FlightSession } from "@/sim/session";
import { Atmosphere } from "./Atmosphere";
import type { SkyId } from "./skyPresets";
import { CameraRig, type CameraSettings } from "./CameraRig";
import { DroneModel } from "./DroneModel";
import { EnvironmentRenderer } from "./EnvironmentRenderer";
import { MissionMarkers } from "./MissionMarkers";

/** Advances the session once per rendered frame (before camera/model update). */
function SimDriver({ session }: { session: FlightSession }) {
  useFrame((_, dt) => session.tick(dt), -10);
  return null;
}

export function FlightScene({ session, quality, camera, sky }: { session: FlightSession; quality: GraphicsQuality; camera: CameraSettings; sky: SkyId }) {
  const preset = GRAPHICS_PRESETS[quality];
  const env = session.sim.env;
  return (
    <Canvas
      shadows={preset.shadows ? { type: PCFSoftShadowMap } : false}
      dpr={[1, preset.maxDpr]}
      gl={{ antialias: preset.antialias, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }}
      camera={{ fov: 100, near: 0.03, far: 400, position: [0, 2, 10] }}
    >
      <Atmosphere
        sky={sky}
        outdoor={!!env.outdoor}
        indoorFog={{ color: env.sky.fogColor, near: env.sky.fogNear, far: env.sky.fogFar }}
        shadows={preset.shadows}
        shadowMapSize={preset.shadowMapSize}
        clouds={preset.clouds}
        ibl={preset.ibl}
      />
      <ambientLight intensity={0.12} />
      {env.lights.slice(0, preset.maxPointLights).map((l, i) => (
        <pointLight key={i} position={l.position} color={l.color} intensity={l.intensity} distance={l.distance} decay={2} />
      ))}
      <EnvironmentRenderer env={env} shadows={preset.shadows} textured={preset.textures} />
      <DroneModel session={session} />
      {session.mission && <MissionMarkers session={session} />}
      <SimDriver session={session} />
      <CameraRig session={session} settings={camera} />
    </Canvas>
  );
}
