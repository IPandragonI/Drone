"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACESFilmicToneMapping, Quaternion, Vector3, type Group, type PerspectiveCamera } from "three";
import { DRONES } from "@/config/drones";
import { buildEnvironment } from "@/env/registry";
import { Atmosphere } from "@/render/Atmosphere";
import { buildDroneModel } from "@/render/droneModels";
import { EnvironmentRenderer } from "@/render/EnvironmentRenderer";
import { parseSky } from "@/render/skyPresets";

interface Recording {
  drone: string;
  fps: number;
  stride: number;
  duration: number;
  poses: number[];
}

declare global {
  interface Window {
    __cine?: { ready: boolean; duration: number; render: (flightTime: number, dt: number) => void };
  }
}

type Shot = "fpv" | "chase" | "spotter";
/** Edit list over the normalised flight time 0..1. */
const SHOTS: Array<[number, Shot]> = [
  [0, "fpv"], [0.3, "chase"], [0.45, "fpv"], [0.72, "spotter"], [0.84, "fpv"],
];

function shotAt(u: number): Shot {
  let s: Shot = "fpv";
  for (const [t, name] of SHOTS) if (u >= t) s = name;
  return s;
}

const _p = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _f = new Vector3();

function sample(rec: Recording, t: number, outP: Vector3, outQ: Quaternion, motors: number[]): void {
  const f = Math.min(Math.max(t, 0), rec.duration) * rec.fps;
  const i0 = Math.min(Math.floor(f), rec.poses.length / rec.stride - 2);
  const a = f - i0;
  const o0 = i0 * rec.stride;
  const o1 = o0 + rec.stride;
  const d = rec.poses;
  outP.set(d[o0] + (d[o1] - d[o0]) * a, d[o0 + 1] + (d[o1 + 1] - d[o0 + 1]) * a, d[o0 + 2] + (d[o1 + 2] - d[o0 + 2]) * a);
  _q.set(d[o0 + 3], d[o0 + 4], d[o0 + 5], d[o0 + 6]);
  _q2.set(d[o1 + 3], d[o1 + 4], d[o1 + 5], d[o1 + 6]);
  outQ.copy(_q).slerp(_q2, a);
  for (let m = 0; m < 4; m++) motors[m] = d[o0 + 7 + m] + (d[o1 + 7 + m] - d[o0 + 7 + m]) * a;
}

function Director({ rec, live }: { rec: Recording; live: boolean }) {
  const drone = DRONES[rec.drone];
  const model = useMemo(() => buildDroneModel(drone), [drone]);
  const time = useRef({ t: 0, dt: 1 / 24 });
  const chase = useRef(new Vector3());
  const chaseInit = useRef(false);
  const get = useThree((s) => s.get);
  const motors = useRef([0, 0, 0, 0]);
  const holder = useRef<Group>(null);
  const pos = useRef(new Vector3());
  const quat = useRef(new Quaternion());

  useEffect(() => () => model.dispose(), [model]);

  useEffect(() => {
    window.__cine = {
      ready: true,
      duration: rec.duration,
      render(flightTime, dt) {
        time.current = { t: flightTime, dt };
        const { advance } = get();
        advance(flightTime * 1000 + 1, true);
      },
    };
    return () => {
      window.__cine = undefined;
    };
  }, [rec, get]);

  useFrame((state, delta) => {
    if (live) time.current = { t: (state.clock.elapsedTime * 1.6) % rec.duration, dt: delta };
    const { t, dt } = time.current;
    const cam = state.camera as PerspectiveCamera;
    const p = pos.current;
    const q = quat.current;
    sample(rec, t, p, q, motors.current);
    const h = holder.current;
    if (h) {
      h.position.copy(p);
      h.quaternion.copy(q);
    }
    model.update(motors.current, dt);

    const shot = shotAt(t / rec.duration);
    if (h) h.visible = shot !== "fpv";
    if (shot === "fpv") {
      const c = drone.camera.fpv;
      _v.set(...c.position).applyQuaternion(q);
      cam.position.copy(p).add(_v);
      _q2.setFromAxisAngle(_f.set(1, 0, 0), (c.tiltDeg * Math.PI) / 180);
      cam.quaternion.copy(q).multiply(_q2);
      cam.fov = 100;
      chaseInit.current = false;
    } else if (shot === "chase") {
      _f.set(0, 0, -1).applyQuaternion(q);
      _f.y = 0;
      _f.normalize();
      _v.copy(p).addScaledVector(_f, -1.15);
      _v.y += 0.42;
      if (!chaseInit.current) {
        chase.current.copy(_v);
        chaseInit.current = true;
      } else chase.current.lerp(_v, 1 - Math.exp(-5 * dt));
      cam.position.copy(chase.current);
      cam.lookAt(p.x, p.y + 0.05, p.z);
      cam.fov = 68;
    } else {
      cam.position.set(-3.2, 1.7, 4.2);
      cam.lookAt(p);
      cam.fov = 42;
      chaseInit.current = false;
    }
    cam.updateProjectionMatrix();
  }, -4);

  return (
    <group ref={holder}>
      <primitive object={model.root} />
    </group>
  );
}

/**
 * Deterministic replay of a real recorded simulation flight (public/hero-flight.json) in the production renderer: textured
 * hall, sky, the detailed drone model, FPV / chase / spotter cameras. Frames are rendered on demand via window.__cine.render,
 * which is how the landing-page hero video is captured (scripts/capture-hero.mjs). Also used as the live fallback on the landing page.
 */
export function CinematicView({ sky = "cloudy", live = false }: { sky?: string; live?: boolean }) {
  const [rec, setRec] = useState<Recording | null>(null);
  const env = useMemo(() => buildEnvironment("industrial-complex"), []);

  useEffect(() => {
    fetch("/hero-flight.json")
      .then((r) => r.json())
      .then(setRec)
      .catch(() => setRec(null));
  }, []);

  if (!rec) return <div className="h-full w-full bg-[#0b0d0f]" />;
  const s = parseSky(sky, "cloudy");
  return (
    <Canvas
      frameloop={live ? "always" : "never"}
      dpr={1}
      shadows
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, preserveDrawingBuffer: true }}
      camera={{ fov: 100, near: 0.03, far: 400, position: [0, 2, 10] }}
    >
      <Atmosphere sky={s} outdoor={false} indoorFog={{ color: env.sky.fogColor, near: env.sky.fogNear, far: env.sky.fogFar }} shadows shadowMapSize={2048} clouds ibl />
      <ambientLight intensity={0.12} />
      {env.lights.slice(0, 8).map((l, i) => (
        <pointLight key={i} position={l.position} color={l.color} intensity={l.intensity} distance={l.distance} decay={2} />
      ))}
      <EnvironmentRenderer env={env} shadows textured />
      <Director rec={rec} live={live} />
    </Canvas>
  );
}
