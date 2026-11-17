import { RepeatWrapping, SRGBColorSpace, TextureLoader, type MeshStandardMaterial, type Texture } from "three";

/**
 * Triplanar PBR for instanced, non-uniformly scaled boxes/cylinders: textures are projected in world space (metres),
 * so a 40 m wall and a 0.3 m beam show the same texel density and nothing stretches. Adds large-scale colour variation
 * and floor grime to break up repetition. Textures: ambientCG (CC0), see docs/ASSETS.md.
 */
export interface TextureSet {
  /** Folder under /textures. */
  name: "concrete" | "metal" | "corrugated" | "wood" | "ground" | "walkway" | "grass" | "rock" | "sand" | "asphalt" | "brick";
  /** World metres covered by one texture repeat. */
  scale: number;
  /** Use the albedo map (false = keep the flat paint colour, take only roughness/normal detail). */
  useColor: boolean;
  /** Normal-map strength 0..1. */
  normal: number;
  /** Multiplier on the roughness map. */
  roughness: number;
  /** Grime/dirt darkening near the floor and large-scale variation, 0..1. */
  wear: number;
}

interface Loaded {
  color: Texture;
  normal: Texture;
  rough: Texture;
}
const loaded = new Map<string, Loaded>();
const loader = new TextureLoader();

function load(name: string): Loaded {
  let l = loaded.get(name);
  if (!l) {
    const t = (file: string, srgb: boolean) => {
      const tex = loader.load(`/textures/${name}/${file}.jpg`);
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.anisotropy = 8;
      if (srgb) tex.colorSpace = SRGBColorSpace;
      return tex;
    };
    l = { color: t("color", true), normal: t("normal", false), rough: t("rough", false) };
    loaded.set(name, l);
  }
  return l;
}

/** Patch a MeshStandardMaterial to use the texture set via triplanar projection. */
export function applyTriplanar(mat: MeshStandardMaterial, set: TextureSet): void {
  const tx = load(set.name);
  mat.customProgramCacheKey = () => `tp-${set.name}-${set.useColor}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tpColor = { value: tx.color };
    shader.uniforms.tpNormal = { value: tx.normal };
    shader.uniforms.tpRough = { value: tx.rough };
    shader.uniforms.tpScale = { value: 1 / set.scale };
    shader.uniforms.tpUseColor = { value: set.useColor ? 1 : 0 };
    shader.uniforms.tpNormalStrength = { value: set.normal };
    shader.uniforms.tpRoughMul = { value: set.roughness };
    shader.uniforms.tpWear = { value: set.wear };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 tpM = modelMatrix * instanceMatrix;
        #else
          mat4 tpM = modelMatrix;
        #endif
        vTpPos = (tpM * vec4(transformed, 1.0)).xyz;
        vTpNrm = normalize(mat3(tpM) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTpPos;
        varying vec3 vTpNrm;
        uniform sampler2D tpColor;
        uniform sampler2D tpNormal;
        uniform sampler2D tpRough;
        uniform float tpScale;
        uniform float tpUseColor;
        uniform float tpNormalStrength;
        uniform float tpRoughMul;
        uniform float tpWear;
        float tpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tpNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(tpHash(i), tpHash(i + vec2(1, 0)), f.x), mix(tpHash(i + vec2(0, 1)), tpHash(i + vec2(1, 1)), f.x), f.y);
        }
        vec3 tpWeights(vec3 n) { vec3 w = pow(abs(n), vec3(5.0)); return w / (w.x + w.y + w.z + 1e-5); }
        // Axis-aligned faces (the common case) have one dominant projection: one texture tap instead of three.
        vec4 tpSample(sampler2D t, vec3 p, vec3 w) {
          if (w.y > 0.85) return texture2D(t, p.xz);
          if (w.x > 0.85) return texture2D(t, p.zy);
          if (w.z > 0.85) return texture2D(t, p.xy);
          return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `{
          vec3 tpP = vTpPos * tpScale;
          vec3 tpW = tpWeights(vTpNrm);
          vec3 albedo = mix(vec3(1.0), tpSample(tpColor, tpP, tpW).rgb, tpUseColor);
          float macro = 0.78 + 0.44 * tpNoise(vTpPos.xz * 0.11 + vTpPos.y * 0.07);
          float fine = 0.9 + 0.2 * tpNoise(vTpPos.xz * 1.7 + vTpPos.y * 1.3);
          float grime = mix(1.0, 0.62 + 0.38 * smoothstep(0.0, 1.6, vTpPos.y), tpWear);
          diffuseColor.rgb *= albedo * mix(1.0, macro * fine, tpWear) * grime;
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
        {
          vec3 tpP = vTpPos * tpScale;
          vec3 tpW = tpWeights(vTpNrm);
          roughnessFactor = clamp(roughness * (0.35 + 1.3 * tpSample(tpRough, tpP, tpW).g) * tpRoughMul, 0.05, 1.0);
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `{
          vec3 tpP = vTpPos * tpScale;
          vec3 wn = normalize(vTpNrm);
          vec3 tpW = tpWeights(wn);
          vec3 wnp;
          if (tpW.y > 0.85) {
            vec3 ty = texture2D(tpNormal, tpP.xz).xyz * 2.0 - 1.0;
            ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
            wnp = normalize(ty.xzy);
          } else if (tpW.x > 0.85) {
            vec3 tx = texture2D(tpNormal, tpP.zy).xyz * 2.0 - 1.0;
            tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
            wnp = normalize(tx.zyx);
          } else if (tpW.z > 0.85) {
            vec3 tz = texture2D(tpNormal, tpP.xy).xyz * 2.0 - 1.0;
            tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
            wnp = normalize(tz.xyz);
          } else {
            vec3 tx = texture2D(tpNormal, tpP.zy).xyz * 2.0 - 1.0;
            vec3 ty = texture2D(tpNormal, tpP.xz).xyz * 2.0 - 1.0;
            vec3 tz = texture2D(tpNormal, tpP.xy).xyz * 2.0 - 1.0;
            tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
            ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
            tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
            wnp = normalize(tx.zyx * tpW.x + ty.xzy * tpW.y + tz.xyz * tpW.z);
          }
          wnp = normalize(mix(wn, wnp, tpNormalStrength));
          normal = normalize((viewMatrix * vec4(wnp, 0.0)).xyz) * faceDirection;
        }`,
      );
  };
  mat.needsUpdate = true;
}
