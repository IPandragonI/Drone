"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Color, Fog, LessEqualDepth, Mesh, PMREMGenerator, Scene, SphereGeometry, Vector3, type ShaderMaterial } from "three";
import { ATMOSPHERES, skyColors, sunDirection, type SkyId } from "./skyPresets";

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  // z = w puts the dome at the far plane: it is drawn last and only shades pixels nothing else covered.
  gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww;
}`;

// Procedural sky: zenith/horizon gradient, sun disc + glow, fractal-noise cloud layer lit from the sun, haze to the fog colour.
const FRAG = `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunColor; uniform vec3 uFog;
uniform vec3 uSunDir; uniform float uCover; uniform float uHaze; uniform float uTime; uniform float uClouds;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}
void main() {
  vec3 v = normalize(vDir);
  float e = v.y;
  float h = pow(1.0 - clamp(e, 0.0, 1.0), 3.2);
  vec3 col = mix(uZenith, uHorizon, h);
  float sd = max(dot(v, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 700.0) * 14.0 + pow(sd, 14.0) * 0.28 + pow(sd, 3.0) * 0.08);
  if (uClouds > 0.5 && e > 0.0) {
    vec2 uv = v.xz / (e + 0.22) * 0.9 + vec2(uTime * 0.012, uTime * 0.005);
    float n = fbm(uv * 1.6);
    float thr = mix(0.72, 0.28, uCover);
    float c = smoothstep(thr, thr + 0.22, n);
    float lit = clamp(0.55 + 0.6 * dot(normalize(vec3(v.x, 0.35, v.z)), normalize(vec3(uSunDir.x, 0.3, uSunDir.z))), 0.0, 1.0);
    vec3 cloudCol = mix(vec3(0.46, 0.5, 0.58), vec3(1.0, 0.98, 0.95) * (0.9 + uSunColor * 0.15), lit);
    cloudCol = mix(cloudCol, uHorizon, h * 0.5);
    c *= smoothstep(0.0, 0.14, e);
    col = mix(col, cloudCol, c * (0.55 + 0.45 * uCover));
  }
  // Heavy cloud cover / fog washes the whole sky toward the fog colour (flat grey-white), not just the horizon.
  col = mix(col, uFog * 0.95, smoothstep(0.6, 1.0, uCover) * 0.8);
  vec3 below = mix(uFog * 0.62, uFog, smoothstep(-0.3, 0.0, e));
  col = e < 0.0 ? mix(col, below, smoothstep(0.0, -0.06, e)) : col;
  col = mix(col, uFog, uHaze * pow(1.0 - clamp(abs(e), 0.0, 1.0), 6.0));
  gl_FragColor = vec4(col, 1.0);
}`;

function skyShaderArgs() {
  return {
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    depthWrite: false,
    depthTest: true,
    depthFunc: LessEqualDepth,
    fog: false,
    uniforms: {
      uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uSunColor: { value: new Color() }, uFog: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) }, uCover: { value: 0.3 }, uHaze: { value: 0.4 }, uTime: { value: 0 }, uClouds: { value: 1 },
    },
  };
}

export interface AtmosphereProps {
  sky: SkyId;
  /** Open-air map: uses the preset fog distance, full sun and sky IBL. Indoor maps keep their own fog and dim the sky light. */
  outdoor: boolean;
  /** Fog used by indoor maps. */
  indoorFog: { color: string; near: number; far: number };
  shadows: boolean;
  shadowMapSize: number;
  clouds: boolean;
  ibl: boolean;
}

/**
 * Sky dome, sun, hemisphere light, fog, exposure and image-based lighting from the sky itself, driven by an
 * AtmospherePreset. Changing `sky` re-derives everything (clear / cloudy / overcast / golden hour / fog).
 */
export function Atmosphere({ sky, outdoor, indoorFog, shadows, shadowMapSize, clouds, ibl }: AtmosphereProps) {
  const preset = ATMOSPHERES[sky];
  const get = useThree((st) => st.get);
  const dome = useRef<Mesh>(null);
  const mat = useRef<ShaderMaterial>(null);
  const [shaderArgs] = useState(skyShaderArgs);
  const colors = useMemo(() => skyColors(preset.sunElevationDeg), [preset.sunElevationDeg]);
  const sunDir = useMemo(() => sunDirection(preset.sunElevationDeg, preset.sunAzimuthDeg), [preset]);

  // Apply preset to the sky shader.
  useEffect(() => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uZenith.value.setRGB(...colors.zenith);
    u.uHorizon.value.setRGB(...colors.horizon);
    u.uSunColor.value.setRGB(...colors.sun);
    u.uFog.value.setRGB(...colors.fog);
    u.uSunDir.value.set(...sunDir);
    u.uCover.value = preset.cloudCover;
    u.uHaze.value = preset.haze;
    u.uClouds.value = clouds ? 1 : 0;
  }, [colors, sunDir, preset, clouds]);

  // Fog and exposure.
  useEffect(() => {
    const { scene, gl } = get();
    scene.fog = outdoor ? new Fog(new Color().setRGB(...colors.fog), 25, preset.fogFar) : new Fog(indoorFog.color, indoorFog.near, indoorFog.far);
    gl.toneMappingExposure = preset.exposure * (outdoor ? 1 : 1.12);
    return () => {
      scene.fog = null;
    };
  }, [get, outdoor, colors, preset, indoorFog.color, indoorFog.near, indoorFog.far]);

  // Image-based lighting: render the sky to a cube once per preset and prefilter it (PMREM).
  useEffect(() => {
    const { scene, gl } = get();
    const src = mat.current;
    if (!ibl || !src) {
      scene.environment = null;
      return;
    }
    const skyScene = new Scene();
    const clone = src.clone();
    const geo = new SphereGeometry(50, 32, 16);
    skyScene.add(new Mesh(geo, clone));
    const pmrem = new PMREMGenerator(gl);
    const rt = pmrem.fromScene(skyScene, 0, 0.1, 100);
    scene.environment = rt.texture;
    scene.environmentIntensity = outdoor ? 0.9 : 0.35;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      clone.dispose();
      geo.dispose();
    };
  }, [get, ibl, outdoor, colors, sunDir, preset.cloudCover, preset.haze, clouds]);

  useFrame((state) => {
    const d = dome.current;
    if (d) d.position.copy(state.camera.position);
    const u = mat.current?.uniforms;
    // eslint-disable-next-line react-hooks/immutability -- animating a shader uniform each frame is the intended R3F pattern
    if (u) u.uTime.value = state.clock.elapsedTime;
  }, -20);

  const sunPos = useMemo(() => new Vector3(...sunDir).multiplyScalar(60), [sunDir]);
  const sunColor = useMemo(() => new Color().setRGB(...colors.sun), [colors]);
  const sunScale = outdoor ? 1 : 0.55; // indoors the sun mostly enters through windows/openings
  const hemiSky = useMemo(() => new Color().setRGB(...colors.zenith).lerp(new Color().setRGB(...colors.horizon), 0.45), [colors]);

  return (
    <>
      <mesh ref={dome} renderOrder={10000} frustumCulled={false}>
        <sphereGeometry args={[300, 40, 20]} />
        <shaderMaterial ref={mat} args={[shaderArgs]} />
      </mesh>
      <hemisphereLight args={[hemiSky, "#3d3a36", preset.ambient * (outdoor ? 1 : 0.55)]} />
      <directionalLight
        position={sunPos}
        intensity={preset.sunIntensity * sunScale}
        color={sunColor}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={150}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}
